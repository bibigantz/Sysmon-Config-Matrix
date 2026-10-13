/* esm.sh - use-sync-external-store@1.2.0/shim/with-selector */
import*as __0$ from"../../../../react@18.3.1/es2022/react.mjs";import*as __1$ from"../shim.mjs";var require=n=>{const e=m=>typeof m.default<"u"?m.default:m,c=m=>Object.assign({__esModule:true},m);switch(n){case"react":return e(__0$);case"use-sync-external-store/shim":return e(__1$);default:console.error('module "'+n+'" not found');return null;}};
var w=Object.create;var S=Object.defineProperty;var D=Object.getOwnPropertyDescriptor;var N=Object.getOwnPropertyNames;var W=Object.getPrototypeOf,k=Object.prototype.hasOwnProperty;var j=(e=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(e,{get:(r,t)=>(typeof require<"u"?require:r)[t]}):e)(function(e){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')});var E=(e,r)=>()=>(r||e((r={exports:{}}).exports,r),r.exports);var M=(e,r,t,i)=>{if(r&&typeof r=="object"||typeof r=="function")for(let u of N(r))!k.call(e,u)&&u!==t&&S(e,u,{get:()=>r[u],enumerable:!(i=D(r,u))||i.enumerable});return e};var R=(e,r,t)=>(t=e!=null?w(W(e)):{},M(r||!e||!e.__esModule?S(t,"default",{value:e,enumerable:!0}):t,e));var y=E(q=>{"use strict";var f=j("react"),_=j("use-sync-external-store/shim");function z(e,r){return e===r&&(e!==0||1/e===1/r)||e!==e&&r!==r}var A=typeof Object.is=="function"?Object.is:z,B=_.useSyncExternalStore,C=f.useRef,F=f.useEffect,G=f.useMemo,H=f.useDebugValue;q.useSyncExternalStoreWithSelector=function(e,r,t,i,u){var o=C(null);if(o.current===null){var s={hasValue:!1,value:null};o.current=s}else s=o.current;o=G(function(){function p(n){if(!m){if(m=!0,d=n,n=i(n),u!==void 0&&s.hasValue){var c=s.value;if(u(c,n))return v=c}return v=n}if(c=v,A(d,n))return c;var x=i(n);return u!==void 0&&u(c,x)?c:(d=n,v=x)}var m=!1,d,v,h=t===void 0?null:t;return[function(){return p(r())},h===null?void 0:function(){return p(h())}]},[r,t,i,u]);var l=B(e,o[0],o[1]);return F(function(){s.hasValue=!0,s.value=l},[l]),H(l),l}});var O=E((K,V)=>{"use strict";V.exports=y()});var a=R(O()),{useSyncExternalStoreWithSelector:L}=a,P=a.default??a;export{P as default,L as useSyncExternalStoreWithSelector};
/*! Bundled license information:

use-sync-external-store/cjs/use-sync-external-store-shim/with-selector.production.min.js:
  (**
   * @license React
   * use-sync-external-store-shim/with-selector.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
