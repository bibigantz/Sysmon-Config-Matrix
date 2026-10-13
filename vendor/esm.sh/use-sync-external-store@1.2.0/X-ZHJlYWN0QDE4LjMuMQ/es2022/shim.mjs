/* esm.sh - use-sync-external-store@1.2.0/shim */
import*as __0$ from"../../../react@18.3.1/es2022/react.mjs";var require=n=>{const e=m=>typeof m.default<"u"?m.default:m,c=m=>Object.assign({__esModule:true},m);switch(n){case"react":return e(__0$);default:console.error('module "'+n+'" not found');return null;}};
var S=Object.create;var f=Object.defineProperty;var m=Object.getOwnPropertyDescriptor;var y=Object.getOwnPropertyNames;var x=Object.getPrototypeOf,E=Object.prototype.hasOwnProperty;var h=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(t,n)=>(typeof require<"u"?require:t)[n]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var d=(e,t)=>()=>(t||e((t={exports:{}}).exports,t),t.exports);var j=(e,t,n,u)=>{if(t&&typeof t=="object"||typeof t=="function")for(let r of y(t))!E.call(e,r)&&r!==n&&f(e,r,{get:()=>t[r],enumerable:!(u=m(t,r))||u.enumerable});return e};var w=(e,t,n)=>(n=e!=null?S(x(e)):{},j(t||!e||!e.__esModule?f(n,"default",{value:e,enumerable:!0}):n,e));var l=d(a=>{"use strict";var o=h("react");function g(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var q=typeof Object.is=="function"?Object.is:g,O=o.useState,D=o.useEffect,N=o.useLayoutEffect,V=o.useDebugValue;function k(e,t){var n=t(),u=O({inst:{value:n,getSnapshot:t}}),r=u[0].inst,c=u[1];return N(function(){r.value=n,r.getSnapshot=t,i(r)&&c({inst:r})},[e,n,t]),D(function(){return i(r)&&c({inst:r}),e(function(){i(r)&&c({inst:r})})},[e]),V(n),n}function i(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!q(e,n)}catch{return!0}}function L(e,t){return t()}var _=typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"?L:k;a.useSyncExternalStore=o.useSyncExternalStore!==void 0?o.useSyncExternalStore:_});var v=d((B,p)=>{"use strict";p.exports=l()});var s=w(v()),{useSyncExternalStore:C}=s,F=s.default??s;export{F as default,C as useSyncExternalStore};
/*! Bundled license information:

use-sync-external-store/cjs/use-sync-external-store-shim.production.min.js:
  (**
   * @license React
   * use-sync-external-store-shim.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
