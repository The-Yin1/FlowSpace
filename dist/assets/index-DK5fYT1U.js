(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))o(r);new MutationObserver(r=>{for(const n of r)if(n.type==="childList")for(const s of n.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&o(s)}).observe(document,{childList:!0,subtree:!0});function i(r){const n={};return r.integrity&&(n.integrity=r.integrity),r.referrerPolicy&&(n.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?n.credentials="include":r.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function o(r){if(r.ep)return;r.ep=!0;const n=i(r);fetch(r.href,n)}})();function l(e,t=!1){return window.__TAURI_INTERNALS__.transformCallback(e,t)}async function u(e,t={},i){return window.__TAURI_INTERNALS__.invoke(e,t,i)}var a;(function(e){e.WINDOW_RESIZED="tauri://resize",e.WINDOW_MOVED="tauri://move",e.WINDOW_CLOSE_REQUESTED="tauri://close-requested",e.WINDOW_DESTROYED="tauri://destroyed",e.WINDOW_FOCUS="tauri://focus",e.WINDOW_BLUR="tauri://blur",e.WINDOW_SCALE_FACTOR_CHANGED="tauri://scale-change",e.WINDOW_THEME_CHANGED="tauri://theme-changed",e.WINDOW_CREATED="tauri://window-created",e.WINDOW_SUSPENDED="tauri://suspended",e.WINDOW_RESUMED="tauri://resumed",e.WEBVIEW_CREATED="tauri://webview-created",e.DRAG_ENTER="tauri://drag-enter",e.DRAG_OVER="tauri://drag-over",e.DRAG_DROP="tauri://drag-drop",e.DRAG_LEAVE="tauri://drag-leave"})(a||(a={}));async function _(e,t){window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(e,t),await u("plugin:event|unlisten",{event:e,eventId:t})}async function p(e,t,i){var o;const r=(o=void 0)!==null&&o!==void 0?o:{kind:"Any"};return u("plugin:event|listen",{event:e,target:r,handler:l(t)}).then(n=>async()=>_(e,n))}const c=document.getElementById("app");function d(e){c.innerHTML=`
    <div class="energy-display">
      <h1>FlowSpace</h1>
      <div class="energy-value">${(e*100).toFixed(1)}%</div>
      <div class="energy-label">Flow Energy</div>
    </div>
  `}async function f(){if(document.documentElement.style.background="transparent",document.body.style.margin="0",document.body.style.background="transparent",d(0),!(typeof window<"u"&&"__TAURI_INTERNALS__"in window&&window.__TAURI_INTERNALS__!==void 0)){c.innerHTML=`
      <div class="energy-display">
        <h1>FlowSpace</h1>
        <p class="hint">此项目需要在 Tauri 桌面窗口中运行</p>
        <p class="hint subtle">请使用 npm run tauri dev 启动</p>
      </div>
    `;return}await p("flow-energy-update",t=>{d(t.payload)})}f();
