use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
  println!("cargo:rerun-if-changed=Info.plist");
  println!("cargo:rerun-if-changed=native/macos_location_bridge.m");

  if env::var("TARGET").map(|target| target.contains("apple-darwin")).unwrap_or(false) {
    build_macos_location_bridge();
  }

  tauri_build::build()
}

fn build_macos_location_bridge() {
  let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR not set"));
  let object_path = out_dir.join("macos_location_bridge.o");
  let library_path = out_dir.join("libmacos_location_bridge.a");
  let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_else(|_| "aarch64".to_string());
  let clang_arch = match target_arch.as_str() {
    "aarch64" => "arm64",
    "x86_64" => "x86_64",
    other => panic!("unsupported macOS target arch for location bridge: {other}"),
  };

  let compile_status = Command::new("xcrun")
    .args([
      "--sdk",
      "macosx",
      "clang",
      "-arch",
      clang_arch,
      "-fobjc-arc",
      "-mmacosx-version-min=10.15",
      "-c",
      "native/macos_location_bridge.m",
      "-o",
    ])
    .arg(&object_path)
    .status()
    .expect("failed to invoke clang for macOS location bridge");

  if !compile_status.success() {
    panic!("failed to compile native/macos_location_bridge.m");
  }

  let archive_status = Command::new("libtool")
    .args(["-static", "-o"])
    .arg(&library_path)
    .arg(&object_path)
    .status()
    .expect("failed to archive macOS location bridge");

  if !archive_status.success() {
    panic!("failed to archive macOS location bridge");
  }

  println!("cargo:rustc-link-search=native={}", out_dir.display());
  println!("cargo:rustc-link-lib=static=macos_location_bridge");
  println!("cargo:rustc-link-lib=framework=Foundation");
  println!("cargo:rustc-link-lib=framework=CoreLocation");
  println!("cargo:rustc-link-lib=objc");
}
