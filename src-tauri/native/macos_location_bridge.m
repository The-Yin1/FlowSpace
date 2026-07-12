#import <Foundation/Foundation.h>
#import <CoreLocation/CoreLocation.h>

@interface FlowSpaceLocationDelegate : NSObject <CLLocationManagerDelegate>
@property(nonatomic, assign) BOOL finished;
@property(nonatomic, assign) BOOL waitingForAuthorization;
@property(nonatomic, assign) BOOL waitingForLocation;
@property(nonatomic, assign) CLAuthorizationStatus authorizationStatus;
@property(nonatomic, strong) CLLocation *location;
@property(nonatomic, strong) NSError *error;
@end

@implementation FlowSpaceLocationDelegate

- (instancetype)init {
  self = [super init];
  if (self) {
    _finished = NO;
    _waitingForAuthorization = NO;
    _waitingForLocation = NO;
    CLLocationManager *probeManager = [[CLLocationManager alloc] init];
    if (@available(macOS 11.0, *)) {
      _authorizationStatus = probeManager.authorizationStatus;
    } else {
      _authorizationStatus = [CLLocationManager authorizationStatus];
    }
  }
  return self;
}

- (void)completeAuthorization:(CLAuthorizationStatus)status {
  self.authorizationStatus = status;
  if (self.waitingForAuthorization && status != kCLAuthorizationStatusNotDetermined) {
    self.finished = YES;
  }
}

- (void)locationManager:(CLLocationManager *)manager didChangeAuthorizationStatus:(CLAuthorizationStatus)status {
  [self completeAuthorization:status];
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager {
  if (@available(macOS 11.0, *)) {
    [self completeAuthorization:manager.authorizationStatus];
  } else {
    [self completeAuthorization:[CLLocationManager authorizationStatus]];
  }
}

- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {
  CLLocation *lastLocation = locations.lastObject;
  if (lastLocation == nil) {
    return;
  }

  self.location = lastLocation;
  self.finished = YES;
  self.waitingForLocation = NO;
  [manager stopUpdatingLocation];
}

- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {
  self.error = error;
  self.finished = YES;
  self.waitingForAuthorization = NO;
  self.waitingForLocation = NO;
  [manager stopUpdatingLocation];
}

@end

static CLAuthorizationStatus FlowSpaceCurrentAuthorizationStatus(CLLocationManager *manager) {
  if (@available(macOS 11.0, *)) {
    return manager.authorizationStatus;
  }
  return [CLLocationManager authorizationStatus];
}

static NSString *FlowSpaceAuthorizationStatusString(CLAuthorizationStatus status) {
  switch (status) {
    case kCLAuthorizationStatusNotDetermined:
      return @"notDetermined";
    case kCLAuthorizationStatusRestricted:
      return @"restricted";
    case kCLAuthorizationStatusDenied:
      return @"denied";
    case kCLAuthorizationStatusAuthorizedAlways:
      return @"authorized";
    default:
      return @"unknown";
  }
}

static NSString *FlowSpacePermissionMessage(BOOL servicesEnabled, CLAuthorizationStatus status) {
  if (!servicesEnabled) {
    return @"系统级定位服务已关闭，请前往系统设置中的“隐私与安全性 > 定位服务”开启。";
  }

  switch (status) {
    case kCLAuthorizationStatusNotDetermined:
      return @"尚未授予定位权限，FlowSpace 会在需要天气与氛围映射时请求一次 macOS 定位授权。";
    case kCLAuthorizationStatusRestricted:
      return @"定位服务受系统限制，当前账户无法修改该权限。";
    case kCLAuthorizationStatusDenied:
      return @"定位权限已被拒绝，请前往系统设置中的“隐私与安全性 > 定位服务”手动开启。";
    case kCLAuthorizationStatusAuthorizedAlways:
      return @"定位权限已授权，FlowSpace 可以读取当前位置并同步天气氛围。";
    default:
      return @"无法确认当前定位权限状态。";
  }
}

static NSDictionary *FlowSpacePermissionPayload(CLAuthorizationStatus status) {
  BOOL servicesEnabled = [CLLocationManager locationServicesEnabled];
  id authorizedValue = [NSNull null];

  if (status == kCLAuthorizationStatusAuthorizedAlways) {
    authorizedValue = @YES;
  } else if (status == kCLAuthorizationStatusDenied) {
    authorizedValue = @NO;
  }

  NSString *authorizationStatus = servicesEnabled
    ? FlowSpaceAuthorizationStatusString(status)
    : @"systemDisabled";

  return @{
    @"platform": @"macos",
    @"systemLocationEnabled": @(servicesEnabled),
    @"appLocationAuthorized": authorizedValue,
    @"authorizationStatus": authorizationStatus,
    @"canPrompt": @(servicesEnabled && status == kCLAuthorizationStatusNotDetermined),
    @"message": FlowSpacePermissionMessage(servicesEnabled, status)
  };
}

static NSString *FlowSpaceJSONStringFromObject(id object) {
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:&error];
  if (data == nil || error != nil) {
    return @"{\"ok\":false,\"error\":\"json-serialization-failed\"}";
  }

  NSString *jsonString = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  return jsonString ?: @"{\"ok\":false,\"error\":\"json-encoding-failed\"}";
}

static char *FlowSpaceCopyCString(NSString *string) {
  const char *utf8 = [string UTF8String];
  if (utf8 == NULL) {
    return NULL;
  }
  return strdup(utf8);
}

static BOOL FlowSpaceRunLoopUntil(FlowSpaceLocationDelegate *delegate, NSTimeInterval timeoutSeconds) {
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:timeoutSeconds];
  while (!delegate.finished) {
    if ([deadline timeIntervalSinceNow] <= 0) {
      return NO;
    }
    [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.1]];
  }
  return YES;
}

static NSDictionary *FlowSpaceRequestPermissionPayload(void) {
  CLLocationManager *manager = [[CLLocationManager alloc] init];
  FlowSpaceLocationDelegate *delegate = [[FlowSpaceLocationDelegate alloc] init];
  manager.delegate = delegate;

  CLAuthorizationStatus status = FlowSpaceCurrentAuthorizationStatus(manager);
  if (![CLLocationManager locationServicesEnabled] || status != kCLAuthorizationStatusNotDetermined) {
    return FlowSpacePermissionPayload(status);
  }

  delegate.waitingForAuthorization = YES;

  if ([manager respondsToSelector:@selector(requestWhenInUseAuthorization)]) {
    [manager requestWhenInUseAuthorization];
  } else {
    [manager startUpdatingLocation];
  }

  BOOL completed = FlowSpaceRunLoopUntil(delegate, 12.0);
  if (!completed) {
    return @{
      @"platform": @"macos",
      @"systemLocationEnabled": @([CLLocationManager locationServicesEnabled]),
      @"appLocationAuthorized": [NSNull null],
      @"authorizationStatus": @"timeout",
      @"canPrompt": @YES,
      @"message": @"等待 macOS 定位授权结果超时，请重试或前往系统设置手动开启。"
    };
  }

  if (delegate.error != nil) {
    return @{
      @"platform": @"macos",
      @"systemLocationEnabled": @([CLLocationManager locationServicesEnabled]),
      @"appLocationAuthorized": [NSNull null],
      @"authorizationStatus": @"error",
      @"canPrompt": @NO,
      @"message": delegate.error.localizedDescription ?: @"请求定位权限失败。"
    };
  }

  status = FlowSpaceCurrentAuthorizationStatus(manager);
  if (status == kCLAuthorizationStatusNotDetermined) {
    status = delegate.authorizationStatus;
  }

  return FlowSpacePermissionPayload(status);
}

static NSDictionary *FlowSpaceCurrentLocationPayload(void) {
  CLLocationManager *manager = [[CLLocationManager alloc] init];
  FlowSpaceLocationDelegate *delegate = [[FlowSpaceLocationDelegate alloc] init];
  manager.delegate = delegate;

  BOOL servicesEnabled = [CLLocationManager locationServicesEnabled];
  CLAuthorizationStatus status = FlowSpaceCurrentAuthorizationStatus(manager);

  if (!servicesEnabled) {
    return @{
      @"ok": @NO,
      @"systemLocationEnabled": @NO,
      @"authorizationStatus": @"systemDisabled",
      @"error": @"系统级定位服务已关闭。"
    };
  }

  if (status == kCLAuthorizationStatusNotDetermined) {
    delegate.waitingForAuthorization = YES;
    if ([manager respondsToSelector:@selector(requestWhenInUseAuthorization)]) {
      [manager requestWhenInUseAuthorization];
    }

    BOOL authCompleted = FlowSpaceRunLoopUntil(delegate, 12.0);
    status = FlowSpaceCurrentAuthorizationStatus(manager);
    if (status == kCLAuthorizationStatusNotDetermined) {
      status = delegate.authorizationStatus;
    }

    if (!authCompleted) {
      return @{
        @"ok": @NO,
        @"systemLocationEnabled": @YES,
        @"authorizationStatus": @"timeout",
        @"error": @"等待定位授权结果超时。"
      };
    }
  }

  if (status == kCLAuthorizationStatusDenied) {
    return @{
      @"ok": @NO,
      @"systemLocationEnabled": @YES,
      @"authorizationStatus": @"denied",
      @"error": @"定位权限已被拒绝。"
    };
  }

  if (status == kCLAuthorizationStatusRestricted) {
    return @{
      @"ok": @NO,
      @"systemLocationEnabled": @YES,
      @"authorizationStatus": @"restricted",
      @"error": @"定位权限受系统限制。"
    };
  }

  delegate.finished = NO;
  delegate.error = nil;
  delegate.location = nil;
  delegate.waitingForLocation = YES;

  if ([manager respondsToSelector:@selector(requestLocation)]) {
    [manager requestLocation];
  } else {
    [manager startUpdatingLocation];
  }

  BOOL locationCompleted = FlowSpaceRunLoopUntil(delegate, 12.0);
  if (!locationCompleted || delegate.location == nil) {
    NSString *message = delegate.error.localizedDescription ?: @"未能在限定时间内获取到定位数据。";
    return @{
      @"ok": @NO,
      @"systemLocationEnabled": @YES,
      @"authorizationStatus": FlowSpaceAuthorizationStatusString(status),
      @"error": message
    };
  }

  CLLocation *location = delegate.location;
  status = FlowSpaceCurrentAuthorizationStatus(manager);
  if (status == kCLAuthorizationStatusNotDetermined) {
    // 已经拿到系统返回的位置数据，按 macOS 实际行为可视为授权完成。
    status = kCLAuthorizationStatusAuthorizedAlways;
  }

  return @{
    @"ok": @YES,
    @"systemLocationEnabled": @YES,
    @"authorizationStatus": FlowSpaceAuthorizationStatusString(status),
    @"latitude": @(location.coordinate.latitude),
    @"longitude": @(location.coordinate.longitude),
    @"accuracy": @(location.horizontalAccuracy),
    @"timestampMs": @([location.timestamp timeIntervalSince1970] * 1000.0)
  };
}

char *flowspace_location_status_json(void) {
  @autoreleasepool {
    CLLocationManager *manager = [[CLLocationManager alloc] init];
    NSString *json = FlowSpaceJSONStringFromObject(FlowSpacePermissionPayload(FlowSpaceCurrentAuthorizationStatus(manager)));
    return FlowSpaceCopyCString(json);
  }
}

char *flowspace_request_location_permission_json(void) {
  @autoreleasepool {
    NSString *json = FlowSpaceJSONStringFromObject(FlowSpaceRequestPermissionPayload());
    return FlowSpaceCopyCString(json);
  }
}

char *flowspace_request_current_location_json(void) {
  @autoreleasepool {
    NSString *json = FlowSpaceJSONStringFromObject(FlowSpaceCurrentLocationPayload());
    return FlowSpaceCopyCString(json);
  }
}

void flowspace_location_free_string(char *value) {
  if (value != NULL) {
    free(value);
  }
}
