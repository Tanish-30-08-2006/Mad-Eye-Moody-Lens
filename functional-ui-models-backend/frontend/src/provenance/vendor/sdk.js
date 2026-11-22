/*!
MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


ISC License

Copyright (c) Eli Mensch

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.


ISC License

Copyright (c) Raice Hannay

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

*/

// node_modules/highgain/dist/index.js
var l = Symbol("transfer");
function M(e, r) {
  return {
    type: l,
    value: e,
    transfer: r ? Array.isArray(r) ? r : [r] : [e]
  };
}
function p(e) {
  return !!(e && typeof e == "object" && Reflect.get(e, "type") === l);
}
function h(e = "default") {
  return {
    createTx(r) {
      const f = /* @__PURE__ */ new Map(), n = r ?? self;
      return n.addEventListener("message", (u2) => {
        const { data: o } = u2;
        if (o.channelName !== e)
          return;
        const { id: a, result: s, error: t } = o, c2 = f.get(a);
        c2 && (t ? c2.reject(t) : c2.resolve(s), f.delete(a));
      }), new Proxy(
        {},
        {
          get(u2, o) {
            return (...a) => {
              const s = g(), t = [], c2 = [];
              return a.forEach((i2) => {
                p(i2) ? (t.push(i2.value), c2.push(...i2.transfer)) : t.push(i2);
              }), n.postMessage(
                { method: o, args: t, id: s, channelName: e },
                { transfer: c2 }
              ), new Promise((i2, y2) => {
                f.set(s, { resolve: i2, reject: y2 });
              });
            };
          }
        }
      );
    },
    rx(r, f) {
      const n = f ?? self;
      n.addEventListener("message", async (d) => {
        const { data: u2 } = d;
        if (u2.channelName !== e)
          return;
        const { method: o, args: a, id: s } = u2;
        try {
          const t = await r[o](...a);
          p(t) ? n.postMessage(
            { result: t.value, id: s, channelName: e },
            { transfer: t.transfer }
          ) : n.postMessage({ result: t, id: s, channelName: e });
        } catch (t) {
          n.postMessage({ error: t, id: s, channelName: e });
        }
      });
    }
  };
}
function g() {
  return new Array(4).fill(0).map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)).join("-");
}

// node_modules/@contentauth/c2pa-web/dist/c2pa-CqMzdYCb.js
var se = Object.defineProperty;
var J = (n) => {
  throw TypeError(n);
};
var oe = (n, e, t) => e in n ? se(n, e, { enumerable: true, configurable: true, writable: true, value: t }) : n[e] = t;
var T = (n, e, t) => oe(n, typeof e != "symbol" ? e + "" : e, t);
var P = (n, e, t) => e.has(n) || J("Cannot " + t);
var i = (n, e, t) => (P(n, e, "read from private field"), t ? t.call(n) : e.get(n));
var v = (n, e, t) => e.has(n) ? J("Cannot add the same private member more than once") : e instanceof WeakSet ? e.add(n) : e.set(n, t);
var S = (n, e, t, r) => (P(n, e, "write to private field"), r ? r.call(n, t) : e.set(n, t), t);
var { createTx: _e, rx: De } = h();
var { createTx: Je, rx: ae } = h("worker");
var Q = '(function(){"use strict";class y{static __wrap(e){const t=Object.create(y.prototype);return t.__wbg_ptr=e,z.register(t,t.__wbg_ptr,t),t}__destroy_into_raw(){const e=this.__wbg_ptr;return this.__wbg_ptr=0,z.unregister(this),e}free(){const e=this.__destroy_into_raw();o.__wbg_wasmbuilder_free(e,0)}addAction(e){const t=o.wasmbuilder_addAction(this.__wbg_ptr,e);if(t[1])throw b(t[0])}addAssertion(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_addAssertion(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}addIngredientFromBlob(e,t,n){const _=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a,s=d(t,o.__wbindgen_malloc,o.__wbindgen_realloc),i=a;return o.wasmbuilder_addIngredientFromBlob(this.__wbg_ptr,_,c,s,i,n)}addIngredient(e){const t=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=a,_=o.wasmbuilder_addIngredient(this.__wbg_ptr,t,n);if(_[1])throw b(_[0])}addRedaction(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_addRedaction(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}addResourceFromBlob(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_addResourceFromBlob(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}filterActionsAndIngredientsAt(e,t){const n=E(e,o.__wbindgen_malloc),_=a,c=E(t,o.__wbindgen_malloc),s=a,i=o.wasmbuilder_filterActionsAndIngredientsAt(this.__wbg_ptr,n,_,c,s);if(i[1])throw b(i[0])}filterActionsAt(e){const t=E(e,o.__wbindgen_malloc),n=a,_=o.wasmbuilder_filterActionsAt(this.__wbg_ptr,t,n);if(_[1])throw b(_[0])}filterIngredientsAt(e){const t=E(e,o.__wbindgen_malloc),n=a,_=o.wasmbuilder_filterIngredientsAt(this.__wbg_ptr,t,n);if(_[1])throw b(_[0])}static fromArchive(e,t){var n=w(t)?0:d(t,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a;const c=o.wasmbuilder_fromArchive(e,n,_);if(c[2])throw b(c[1]);return y.__wrap(c[0])}static fromJson(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a;var c=w(t)?0:d(t,o.__wbindgen_malloc,o.__wbindgen_realloc),s=a;const i=o.wasmbuilder_fromJson(n,_,c,s);if(i[2])throw b(i[1]);return y.__wrap(i[0])}getDefinition(){const e=o.wasmbuilder_getDefinition(this.__wbg_ptr);if(e[2])throw b(e[1]);return b(e[0])}static new(e){var t=w(e)?0:d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=a;const _=o.wasmbuilder_new(t,n);if(_[2])throw b(_[1]);return y.__wrap(_[0])}setIntent(e){const t=o.wasmbuilder_setIntent(this.__wbg_ptr,e);if(t[1])throw b(t[0])}setNoEmbed(e){o.wasmbuilder_setNoEmbed(this.__wbg_ptr,e)}setRemoteUrl(e){const t=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=a;o.wasmbuilder_setRemoteUrl(this.__wbg_ptr,t,n)}setThumbnailFromBlob(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_setThumbnailFromBlob(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}signAndGetManifestBytes(e,t,n,_){const c=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),s=a;return o.wasmbuilder_signAndGetManifestBytes(this.__wbg_ptr,e,t,c,s,_)}sign(e,t,n,_){const c=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),s=a;return o.wasmbuilder_sign(this.__wbg_ptr,e,t,c,s,_)}toArchive(){const e=o.wasmbuilder_toArchive(this.__wbg_ptr);if(e[2])throw b(e[1]);return b(e[0])}updateActionsAt(e){const t=o.wasmbuilder_updateActionsAt(this.__wbg_ptr,e);if(t[1])throw b(t[0])}updateAssertionsAt(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_updateAssertionsAt(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}updateManifestProperty(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_updateManifestProperty(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}}Symbol.dispose&&(y.prototype[Symbol.dispose]=y.prototype.free);class F{static __wrap(e){const t=Object.create(F.prototype);return t.__wbg_ptr=e,N.register(t,t.__wbg_ptr,t),t}__destroy_into_raw(){const e=this.__wbg_ptr;return this.__wbg_ptr=0,N.unregister(this),e}free(){const e=this.__destroy_into_raw();o.__wbg_wasmreader_free(e,0)}activeLabel(){const e=o.wasmreader_activeLabel(this.__wbg_ptr);let t;return e[0]!==0&&(t=p(e[0],e[1]),o.__wbindgen_free(e[0],e[1]*1,1)),t}activeManifest(){const e=o.wasmreader_activeManifest(this.__wbg_ptr);if(e[2])throw b(e[1]);return b(e[0])}crJson(){let e,t;try{const n=o.wasmreader_crJson(this.__wbg_ptr);return e=n[0],t=n[1],p(n[0],n[1])}finally{o.__wbindgen_free(e,t,1)}}static fromBlobFragment(e,t,n,_){const c=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),s=a;var i=w(_)?0:d(_,o.__wbindgen_malloc,o.__wbindgen_realloc),u=a;return o.wasmreader_fromBlobFragment(c,s,t,n,i,u)}static fromBlob(e,t,n){const _=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a;var s=w(n)?0:d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),i=a;return o.wasmreader_fromBlob(_,c,t,s,i)}static fromBytes(e,t,n){const _=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a,s=ee(t,o.__wbindgen_malloc),i=a;var u=w(n)?0:d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),g=a;return o.wasmreader_fromBytes(_,c,s,i,u,g)}json(){let e,t;try{const n=o.wasmreader_json(this.__wbg_ptr);return e=n[0],t=n[1],p(n[0],n[1])}finally{o.__wbindgen_free(e,t,1)}}manifestStore(){const e=o.wasmreader_manifestStore(this.__wbg_ptr);if(e[2])throw b(e[1]);return b(e[0])}resourceToBytes(e){const t=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=a,_=o.wasmreader_resourceToBytes(this.__wbg_ptr,t,n);if(_[2])throw b(_[1]);return b(_[0])}}Symbol.dispose&&(F.prototype[Symbol.dispose]=F.prototype.free);function C(r){const e=o.encodeSignerPayload(r);if(e[3])throw b(e[2]);var t=A(e[0],e[1]).slice();return o.__wbindgen_free(e[0],e[1]*1,1),t}function G(){return{__proto__:null,"./c2pa_bg.js":{__proto__:null,__wbg_Error_30c8987f7c2ed4e2:function(e,t){return Error(p(e,t))},__wbg_Number_14af1003b8dd5ead:function(e){return Number(e)},__wbg_String_8564e559799eccda:function(e,t){const n=String(t),_=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg___wbindgen_bigint_get_as_i64_a2383202b9353e4c:function(e,t){const n=t,_=typeof n=="bigint"?n:void 0;m().setBigInt64(e+8,w(_)?BigInt(0):_,!0),m().setInt32(e+0,!w(_),!0)},__wbg___wbindgen_boolean_get_5b446f51afd21013:function(e){const t=e,n=typeof t=="boolean"?t:void 0;return w(n)?16777215:n?1:0},__wbg___wbindgen_debug_string_4687d8d8c2017d52:function(e,t){const n=U(t),_=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg___wbindgen_in_92f62ee1427d9e49:function(e,t){return e in t},__wbg___wbindgen_is_bigint_b123553bed3bb382:function(e){return typeof e=="bigint"},__wbg___wbindgen_is_function_1f9d30630b8b1d3d:function(e){return typeof e=="function"},__wbg___wbindgen_is_null_e343b7d08827ba72:function(e){return e===null},__wbg___wbindgen_is_object_3c45d4f2dde4e749:function(e){const t=e;return typeof t=="object"&&t!==null},__wbg___wbindgen_is_string_90b56bc79aad6f6c:function(e){return typeof e=="string"},__wbg___wbindgen_is_undefined_8865fb403f8fe9d8:function(e){return e===void 0},__wbg___wbindgen_jsval_eq_02babf21faa37971:function(e,t){return e===t},__wbg___wbindgen_jsval_loose_eq_677f21e468d6b461:function(e,t){return e==t},__wbg___wbindgen_number_get_2e0e7dee9f701a71:function(e,t){const n=t,_=typeof n=="number"?n:void 0;m().setFloat64(e+8,w(_)?0:_,!0),m().setInt32(e+0,!w(_),!0)},__wbg___wbindgen_string_get_0380ccaa2f57f0d9:function(e,t){const n=t,_=typeof n=="string"?n:void 0;var c=w(_)?0:d(_,o.__wbindgen_malloc,o.__wbindgen_realloc),s=a;m().setInt32(e+4,s,!0),m().setInt32(e+0,c,!0)},__wbg___wbindgen_throw_41e9ee4f547fc59a:function(e,t){throw new Error(p(e,t))},__wbg__wbg_cb_unref_dcc1a90847f04c41:function(e){e._wbg_cb_unref()},__wbg_abort_334e7f918b7c5047:function(e,t){e.abort(t)},__wbg_abort_f78b99d80248bacb:function(e){e.abort()},__wbg_append_1938ed58fb5613b8:function(){return l(function(e,t,n,_,c){e.append(p(t,n),p(_,c))},arguments)},__wbg_arrayBuffer_f07be74819944ea2:function(){return l(function(e){return e.arrayBuffer()},arguments)},__wbg_byteLength_9f985b8373f1f3fe:function(e){return e.byteLength},__wbg_call_187d372bd5fdd4aa:function(){return l(function(e,t,n){return e.call(t,n)},arguments)},__wbg_call_6137034ef55c9d0f:function(){return l(function(e,t){return e.call(t)},arguments)},__wbg_clearTimeout_6b8d9a38b9263d65:function(e){return clearTimeout(e)},__wbg_crypto_38df2bab126b63dc:function(e){return e.crypto},__wbg_done_b41a1d26cdb37fb6:function(e){return e.done},__wbg_entries_fb6397112b1de25f:function(e){return Object.entries(e)},__wbg_error_757e9472f8410341:function(e,t){let n,_;try{n=e,_=t,console.error(p(e,t))}finally{o.__wbindgen_free(n,_,1)}},__wbg_fetch_9dad4fe911207b37:function(e){return fetch(e)},__wbg_fetch_efc64baf325b084d:function(e,t){return e.fetch(t)},__wbg_from_296ca31f8d0f1c52:function(e){return Array.from(e)},__wbg_getRandomValues_436a51d0629d84e1:function(){return l(function(e,t){globalThis.crypto.getRandomValues(A(e,t))},arguments)},__wbg_getRandomValues_a608c4436c19407a:function(){return l(function(e,t){globalThis.crypto.getRandomValues(A(e,t))},arguments)},__wbg_getRandomValues_a678b7300e8ed57f:function(){return l(function(e,t){globalThis.crypto.getRandomValues(A(e,t))},arguments)},__wbg_getRandomValues_c44a50d8cfdaebeb:function(){return l(function(e,t){e.getRandomValues(t)},arguments)},__wbg_getTime_f5a55efff2585d5d:function(e){return e.getTime()},__wbg_get_31af05bd4842a84f:function(){return l(function(e,t){return Reflect.get(e,t)},arguments)},__wbg_get_658f6698067d9515:function(){return l(function(e,t){return Reflect.get(e,t)},arguments)},__wbg_get_6c896e0571ddae51:function(e,t){return e[t>>>0]},__wbg_get_unchecked_288889d017702237:function(e,t){return e[t>>>0]},__wbg_get_with_ref_key_6412cf3094599694:function(e,t){return e[t]},__wbg_has_5d6706e5209576c1:function(){return l(function(e,t){return Reflect.has(e,t)},arguments)},__wbg_headers_eba93595f8944c2f:function(e){return e.headers},__wbg_instanceof_ArrayBuffer_a99f175873e5d9b8:function(e){let t;try{t=e instanceof ArrayBuffer}catch{t=!1}return t},__wbg_instanceof_Map_b2611749102d7ba3:function(e){let t;try{t=e instanceof Map}catch{t=!1}return t},__wbg_instanceof_Promise_e1dc6893aa1ece28:function(e){let t;try{t=e instanceof Promise}catch{t=!1}return t},__wbg_instanceof_Response_b8758567269c30b2:function(e){let t;try{t=e instanceof Response}catch{t=!1}return t},__wbg_instanceof_Uint8Array_828cef2aaacafc31:function(e){let t;try{t=e instanceof Uint8Array}catch{t=!1}return t},__wbg_isArray_e15a2ff68ffdbef2:function(e){return Array.isArray(e)},__wbg_isSafeInteger_717808ad6a54bd9e:function(e){return Number.isSafeInteger(e)},__wbg_iterator_e3c31c892080e444:function(){return Symbol.iterator},__wbg_length_7f3c00c40364105e:function(e){return e.length},__wbg_length_d4bdea10311bd9cf:function(e){return e.length},__wbg_msCrypto_bd5a034af96bcba6:function(e){return e.msCrypto},__wbg_new_0_72d020f0c63443d4:function(){return new Date},__wbg_new_1dbf7428bba60a42:function(e){return new Uint8Array(e)},__wbg_new_227d7c05414eb861:function(){return new Error},__wbg_new_28744009d011f847:function(){return new Map},__wbg_new_2e41357094e99294:function(){return l(function(){return new AbortController},arguments)},__wbg_new_617a8cdb8bb1130e:function(){return new Object},__wbg_new_83ca405eae412a62:function(){return l(function(){return new Headers},arguments)},__wbg_new_9ffe4dece67ce9fc:function(){return l(function(){return new FileReaderSync},arguments)},__wbg_new_ee2291f50781bf1d:function(){return new Array},__wbg_new_from_slice_9a868026ffa4208a:function(e,t){return new Uint8Array(A(e,t))},__wbg_new_typed_b01cb72a8af741a3:function(e,t){try{var n={a:e,b:t},_=(s,i)=>{const u=n.a;n.a=0;try{return X(u,n.b,s,i)}finally{n.a=u}};return new Promise(_)}finally{n.a=0}},__wbg_new_with_length_3da0ad195f6f63ba:function(e){return new Uint8Array(e>>>0)},__wbg_new_with_str_and_init_4618dee4e950224f:function(){return l(function(e,t,n){return new Request(p(e,t),n)},arguments)},__wbg_next_33784799010f1bbe:function(e){return e.next},__wbg_next_f4aac29c42af995c:function(){return l(function(e){return e.next()},arguments)},__wbg_node_84ea875411254db1:function(e){return e.node},__wbg_now_aa4ccb83129e9e55:function(){return Date.now()},__wbg_process_44c7a14e11e9f69e:function(e){return e.process},__wbg_prototypesetcall_bc27214492979395:function(e,t,n){Uint8Array.prototype.set.call(A(e,t),n)},__wbg_queueMicrotask_9833f9a49df95a49:function(e){return e.queueMicrotask},__wbg_queueMicrotask_a72f977e97f23c5f:function(e){queueMicrotask(e)},__wbg_randomFillSync_6c25eac9869eb53c:function(){return l(function(e,t){e.randomFillSync(t)},arguments)},__wbg_readAsArrayBuffer_14bc98cc9cdf7c0b:function(){return l(function(e,t){return e.readAsArrayBuffer(t)},arguments)},__wbg_require_b4edbdcf3e2a1ef0:function(){return l(function(){return module.require},arguments)},__wbg_resolve_0076e10020304ede:function(e){return Promise.resolve(e)},__wbg_setTimeout_f757f00851f76c42:function(e,t){return setTimeout(e,t)},__wbg_set_575d3ddb70fe831d:function(e,t,n){e.set(A(t,n))},__wbg_set_6ae97e73113c4f0b:function(e,t,n){return e.set(t,n)},__wbg_set_6be42768c690e380:function(e,t,n){e[t]=n},__wbg_set_bea140a88be9b277:function(e,t,n){e[t>>>0]=n},__wbg_set_body_1fb0f1008bfc7df6:function(e,t){e.body=t},__wbg_set_cache_7507c4cc5938ccc7:function(e,t){e.cache=Y[t]},__wbg_set_credentials_e0dcce31ca532b7d:function(e,t){e.credentials=K[t]},__wbg_set_headers_40ad33dcf016613f:function(e,t){e.headers=t},__wbg_set_method_dcb32343247ec427:function(e,t,n){e.method=p(t,n)},__wbg_set_mode_74e772635acb96ec:function(e,t){e.mode=Q[t]},__wbg_set_signal_2dbd377604627f26:function(e,t){e.signal=t},__wbg_signal_e5a49a2d9c65b7f6:function(e){return e.signal},__wbg_size_8f1c0b1a1fbb3810:function(e){return e.size},__wbg_slice_afd8274aed4149c0:function(){return l(function(e,t,n){return e.slice(t,n)},arguments)},__wbg_stack_3b0d974bbf31e44f:function(e,t){const n=t.stack,_=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg_static_accessor_GLOBAL_266715b9d96ba635:function(){const e=typeof global>"u"?null:global;return w(e)?0:R(e)},__wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179:function(){const e=typeof globalThis>"u"?null:globalThis;return w(e)?0:R(e)},__wbg_static_accessor_SELF_0b583911f537483a:function(){const e=typeof self>"u"?null:self;return w(e)?0:R(e)},__wbg_static_accessor_WINDOW_d7f903d1508cbdc4:function(){const e=typeof window>"u"?null:window;return w(e)?0:R(e)},__wbg_status_ce0a98d3c57125f3:function(e){return e.status},__wbg_stringify_52ff602c1cc4fbb6:function(){return l(function(e){return JSON.stringify(e)},arguments)},__wbg_subarray_002b94d5e13d1411:function(e,t,n){return e.subarray(t>>>0,n>>>0)},__wbg_then_c949d5a25a4e78f8:function(e,t,n){return e.then(t,n)},__wbg_then_e71170d78fcf8954:function(e,t){return e.then(t)},__wbg_url_8e28edeab4cd6bed:function(e,t){const n=t.url,_=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg_valueOf_6abcff09c8156bb6:function(e){return e.valueOf()},__wbg_value_f3c585ee8f5ba40c:function(e){return e.value},__wbg_versions_276b2795b1c6a219:function(e){return e.versions},__wbg_wasmreader_new:function(e){return F.__wrap(e)},__wbindgen_generic_0000000000000001:function(e,t){return L(e,t,H)},__wbindgen_generic_0000000000000002:function(e,t){return L(e,t,$)},__wbindgen_generic_0000000000000003:function(e){return e},__wbindgen_generic_0000000000000004:function(e){return e},__wbindgen_generic_0000000000000005:function(e,t){return A(e,t)},__wbindgen_generic_0000000000000006:function(e,t){return p(e,t)},__wbindgen_generic_0000000000000007:function(e){return BigInt.asUintN(64,e)},__wbindgen_generic_0000000000000008:function(e,t){var n=A(e,t).slice();return o.__wbindgen_free(e,t*1,1),n},__wbindgen_init_externref_table:function(){const e=o.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}function $(r,e){o.wasm_bindgen_255200e6d97c625a___convert__closures_____invoke_______true_(r,e)}function H(r,e,t){const n=o.wasm_bindgen_255200e6d97c625a___convert__closures_____invoke___wasm_bindgen_255200e6d97c625a___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_255200e6d97c625a___JsError___true_(r,e,t);if(n[1])throw b(n[0])}function X(r,e,t,n){o.wasm_bindgen_255200e6d97c625a___convert__closures_____invoke___js_sys_bd80bcec31efc073___Function_fn_wasm_bindgen_255200e6d97c625a___JsValue_____wasm_bindgen_255200e6d97c625a___sys__Undefined___js_sys_bd80bcec31efc073___Function_fn_wasm_bindgen_255200e6d97c625a___JsValue_____wasm_bindgen_255200e6d97c625a___sys__Undefined_______true_(r,e,t,n)}const Y=["default","no-store","reload","no-cache","force-cache","only-if-cached"],K=["omit","same-origin","include"],Q=["same-origin","no-cors","cors","navigate"],z=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(r=>o.__wbg_wasmbuilder_free(r,1)),N=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(r=>o.__wbg_wasmreader_free(r,1));typeof FinalizationRegistry>"u"||new FinalizationRegistry(r=>o.__wbg_wasmsigner_free(r,1));function R(r){const e=o.__externref_table_alloc();return o.__wbindgen_externrefs.set(e,r),e}const J=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(r=>o.__wbindgen_destroy_closure(r.a,r.b));function U(r){const e=typeof r;if(e=="number"||e=="boolean"||r==null)return`${r}`;if(e=="string")return`"${r}"`;if(e=="symbol"){const _=r.description;return _==null?"Symbol":`Symbol(${_})`}if(e=="function"){const _=r.name;return typeof _=="string"&&_.length>0?`Function(${_})`:"Function"}if(Array.isArray(r)){const _=r.length;let c="[";_>0&&(c+=U(r[0]));for(let s=1;s<_;s++)c+=", "+U(r[s]);return c+="]",c}const t=/\\[object ([^\\]]+)\\]/.exec(toString.call(r));let n;if(t&&t.length>1)n=t[1];else return toString.call(r);if(n=="Object")try{return"Object("+JSON.stringify(r)+")"}catch{return"Object"}return r instanceof Error?`${r.name}: ${r.message}\n${r.stack}`:n}function A(r,e){return r=r>>>0,S().subarray(r/1,r/1+e)}let M=null;function m(){return(M===null||M.buffer.detached===!0||M.buffer.detached===void 0&&M.buffer!==o.memory.buffer)&&(M=new DataView(o.memory.buffer)),M}function p(r,e){return ne(r>>>0,e)}let B=null;function Z(){return(B===null||B.byteLength===0)&&(B=new Uint32Array(o.memory.buffer)),B}let T=null;function S(){return(T===null||T.byteLength===0)&&(T=new Uint8Array(o.memory.buffer)),T}function l(r,e){try{return r.apply(this,e)}catch(t){const n=R(t);o.__wbindgen_exn_store(n)}}function w(r){return r==null}function L(r,e,t){const n={a:r,b:e,cnt:1},_=(...c)=>{n.cnt++;const s=n.a;n.a=0;try{return t(s,n.b,...c)}finally{n.a=s,_._wbg_cb_unref()}};return _._wbg_cb_unref=()=>{--n.cnt===0&&(o.__wbindgen_destroy_closure(n.a,n.b),n.a=0,J.unregister(n))},J.register(_,n,n),_}function E(r,e){const t=e(r.length*4,4)>>>0;return Z().set(r,t/4),a=r.length,t}function ee(r,e){const t=e(r.length*1,1)>>>0;return S().set(r,t/1),a=r.length,t}function d(r,e,t){if(t===void 0){const i=j.encode(r),u=e(i.length,1)>>>0;return S().subarray(u,u+i.length).set(i),a=i.length,u}let n=r.length,_=e(n,1)>>>0;const c=S();let s=0;for(;s<n;s++){const i=r.charCodeAt(s);if(i>127)break;c[_+s]=i}if(s!==n){s!==0&&(r=r.slice(s)),_=t(_,n,n=s+r.length*3,1)>>>0;const i=S().subarray(_+s,_+n),u=j.encodeInto(r,i);s+=u.written,_=t(_,n,s,1)>>>0}return a=s,_}function b(r){const e=o.__wbindgen_externrefs.get(r);return o.__externref_table_dealloc(r),e}let O=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0});O.decode();const te=2146435072;let x=0;function ne(r,e){return x+=e,x>=te&&(O=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0}),O.decode(),x=e),O.decode(S().subarray(r,r+e))}const j=new TextEncoder;"encodeInto"in j||(j.encodeInto=function(r,e){const t=j.encode(r);return e.set(t),{read:r.length,written:t.length}});let a=0,o;function re(r,e){return o=r.exports,M=null,B=null,T=null,o.__wbindgen_start(),o}function _e(r){if(o!==void 0)return o;r!==void 0&&(Object.getPrototypeOf(r)===Object.prototype?{module:r}=r:console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));const e=G();r instanceof WebAssembly.Module||(r=new WebAssembly.Module(r));const t=new WebAssembly.Instance(r,e);return re(t)}function V(){let r=0;const e=new Map;return{add(t){const n=r++;return e.set(n,t),n},get(t){const n=e.get(t);if(!n)throw new Error("Attempted to use an object that has been freed");return n},remove(t){return e.delete(t)}}}const D=Symbol("transfer");function v(r,e){return{type:D,value:r,transfer:e?Array.isArray(e)?e:[e]:[r]}}function P(r){return!!(r&&typeof r=="object"&&Reflect.get(r,"type")===D)}function W(r="default"){return{createTx(e){const t=new Map,n=e??self;return n.addEventListener("message",_=>{const{data:c}=_;if(c.channelName!==r)return;const{id:s,result:i,error:u}=c,g=t.get(s);g&&(u?g.reject(u):g.resolve(i),t.delete(s))}),new Proxy({},{get(_,c){return(...s)=>{const i=oe(),u=[],g=[];return s.forEach(I=>{P(I)?(u.push(I.value),g.push(...I.transfer)):u.push(I)}),n.postMessage({method:c,args:u,id:i,channelName:r},{transfer:g}),new Promise((I,ue)=>{t.set(i,{resolve:I,reject:ue})})}}})},rx(e,t){const n=t??self;n.addEventListener("message",async _=>{const{data:c}=_;if(c.channelName!==r)return;const{method:s,args:i,id:u}=c;try{const g=await e[s](...i);P(g)?n.postMessage({result:g.value,id:u,channelName:r},{transfer:g.transfer}):n.postMessage({result:g,id:u,channelName:r})}catch(g){n.postMessage({error:g,id:u,channelName:r})}})}}}function oe(){return new Array(4).fill(0).map(()=>Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)).join("-")}const{rx:ce}=W(),{createTx:se}=W("worker");function ie(r){if(!(r!=null&&r.manifests))return r;const e=r.manifests,t=Object.assign(Object.create(null),e),n=Object.getPrototypeOf(e);return n!==null&&n!==Object.prototype&&(t.__proto__=n),r.manifests=t,r}const h=V(),f=V(),k=se();function q(r){return r.map(e=>({sigType:e.sigType,reserveSize:e.reserveSize,referencedAssertions:e.referencedAssertions,roles:e.roles,sign:async t=>{const n=t.referencedAssertions.map(c=>c.hash.buffer);return await k.cawgSign(e.requestId,v(t,n))}}))}ce(ae({async initWorker(r){_e({module:r})},encodeSignerPayload(r){const e=C(r);return v(e,e.buffer)},async reader_fromBlob(r,e,t){const n=await F.fromBlob(r,e,t);return h.add(n)},async reader_fromBlobFragment(r,e,t,n){const _=await F.fromBlobFragment(r,e,t,n);return h.add(_)},reader_activeLabel(r){return h.get(r).activeLabel()??null},reader_manifestStore(r){const e=h.get(r);return ie(e.manifestStore())},reader_activeManifest(r){return h.get(r).activeManifest()},reader_json(r){return h.get(r).json()},reader_crJson(r){return h.get(r).crJson()},reader_resourceToBytes(r,e){const n=h.get(r).resourceToBytes(e);return v(n,n.buffer)},reader_free(r){h.get(r).free(),h.remove(r)},builder_new(r){const e=y.new(r);return f.add(e)},builder_fromJson(r,e){const t=y.fromJson(r,e);return f.add(t)},builder_fromArchive(r,e){const t=y.fromArchive(r,e);return f.add(t)},builder_setIntent(r,e){f.get(r).setIntent(e)},builder_addAction(r,e){f.get(r).addAction(e)},builder_addAssertion(r,e,t){f.get(r).addAssertion(e,t)},builder_updateAssertionsAt(r,e,t){f.get(r).updateAssertionsAt(e,t)},builder_addRedaction(r,e,t){f.get(r).addRedaction(e,t)},builder_filterActionsAt(r,e){f.get(r).filterActionsAt(Uint32Array.from(e))},builder_updateActionsAt(r,e){f.get(r).updateActionsAt(e)},builder_filterIngredientsAt(r,e){f.get(r).filterIngredientsAt(Uint32Array.from(e))},builder_filterActionsAndIngredientsAt(r,e,t){f.get(r).filterActionsAndIngredientsAt(Uint32Array.from(e),Uint32Array.from(t))},builder_setRemoteUrl(r,e){f.get(r).setRemoteUrl(e)},builder_setNoEmbed(r,e){f.get(r).setNoEmbed(e)},builder_updateManifestProperty(r,e,t){f.get(r).updateManifestProperty(e,t)},builder_setThumbnailFromBlob(r,e,t){f.get(r).setThumbnailFromBlob(e,t)},builder_addIngredient(r,e){f.get(r).addIngredient(e)},async builder_addIngredientFromBlob(r,e,t,n){await f.get(r).addIngredientFromBlob(e,t,n)},builder_addResourceFromBlob(r,e,t){f.get(r).addResourceFromBlob(e,t)},builder_getDefinition(r){return f.get(r).getDefinition()},builder_toArchive(r){const t=f.get(r).toArchive();return v(t,t.buffer)},async builder_sign(r,e,t,n,_,c){const i=await f.get(r).sign({reserveSize:t.reserveSize,alg:t.alg,sign:async u=>await k.sign(e,v(u,u.buffer),t.reserveSize)},q(n),_,c);return v(i,i.buffer)},async builder_signAndGetManifestBytes(r,e,t,n,_,c){const s=f.get(r),{manifest:i,asset:u}=await s.signAndGetManifestBytes({reserveSize:t.reserveSize,alg:t.alg,sign:async g=>await k.sign(e,v(g,g.buffer),t.reserveSize)},q(n),_,c);return v({manifest:i,asset:u},[i.buffer,u.buffer])},builder_free(r){f.get(r).free(),f.remove(r)}}));function ae(r){const e={};for(const[t,n]of Object.entries(r))e[t]=async(..._)=>{try{return await n(..._)}catch(c){throw typeof c=="string"?new Error(c):c}};return e}})();\n';
var $ = typeof self < "u" && self.Blob && new Blob([Q], { type: "text/javascript;charset=utf-8" });
function ce(n) {
  let e;
  try {
    if (e = $ && (self.URL || self.webkitURL).createObjectURL($), !e) throw "";
    const t = new Worker(e, {
      name: n == null ? void 0 : n.name
    });
    return t.addEventListener("error", () => {
      (self.URL || self.webkitURL).revokeObjectURL(e);
    }), t;
  } catch {
    return new Worker(
      "data:text/javascript;charset=utf-8," + encodeURIComponent(Q),
      {
        name: n == null ? void 0 : n.name
      }
    );
  } finally {
    e && (self.URL || self.webkitURL).revokeObjectURL(e);
  }
}
function ue(n) {
  if (n.protocol !== "https:")
    throw new Error(
      `Worker source URL must use https, but got ${n.protocol}`
    );
  return n.toString();
}
async function fe(n) {
  const { wasm: e, workerSrc: t } = n;
  let r = 0;
  const o = t ? new Worker(ue(t), { type: "module" }) : new ce(), s = _e(o), _ = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map();
  ae(
    {
      sign: async (d, l2, b) => {
        const g2 = _.get(d);
        if (_.delete(d), !g2)
          throw new Error("No signer registered for request");
        const A = await g2(l2, b);
        return M(A, A.buffer);
      },
      // Reverse-RPC handler for a CAWG credential holder's `sign`, mirroring
      // `sign` above: the callback was registered on the main thread by
      // `Builder.sign`/`signAndGetManifestBytes` (see
      // `registerCredentialHolderReceiver`) and is looked up and run here,
      // never inside the worker.
      cawgSign: async (d, l2) => {
        const b = a.get(d);
        if (a.delete(d), !b)
          throw new Error("No credential holder registered for request");
        const g2 = await b(l2);
        return M(g2, g2.buffer);
      }
    },
    o
  );
  function f(d) {
    const l2 = r++;
    return _.set(l2, d), l2;
  }
  function m(d) {
    const l2 = r++;
    return a.set(l2, d), l2;
  }
  return await s.initWorker(e), {
    tx: s,
    registerSignReceiver: f,
    registerCredentialHolderReceiver: m,
    terminate: () => o.terminate()
  };
}
typeof FinalizationRegistry > "u" || new FinalizationRegistry((n) => O.__wbg_wasmbuilder_free(n, 1));
typeof FinalizationRegistry > "u" || new FinalizationRegistry((n) => O.__wbg_wasmreader_free(n, 1));
typeof FinalizationRegistry > "u" || new FinalizationRegistry((n) => O.__wbg_wasmsigner_free(n, 1));
typeof FinalizationRegistry > "u" || new FinalizationRegistry((n) => O.__wbindgen_destroy_closure(n.a, n.b));
var de = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true });
de.decode();
var U = new TextEncoder();
"encodeInto" in U || (U.encodeInto = function(n, e) {
  const t = U.encode(n);
  return e.set(t), {
    read: n.length,
    written: t.length
  };
});
var O;
var le = "sha512-8n+fD7p0Ub6oJZTuqCs9963t8zreMwliFGiAfr3DMETjZ4m8ai4kJmD2ITad/CvCUebhyB0IfHhFGn5OpY33dg==";
var F = (n) => {
  if (typeof n == "object" && n !== null) {
    if (typeof Object.getPrototypeOf == "function") {
      const e = Object.getPrototypeOf(n);
      return e === Object.prototype || e === null;
    }
    return Object.prototype.toString.call(n) === "[object Object]";
  }
  return false;
};
var be = /* @__PURE__ */ new Set([
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString"
]);
var w = (...n) => n.reduce((e, t) => {
  if (t === void 0)
    return e;
  if (Array.isArray(t))
    throw new TypeError("Arguments provided to ts-deepmerge must be objects, not arrays.");
  return Object.keys(t).forEach((r) => {
    be.has(r) || (Array.isArray(e[r]) && Array.isArray(t[r]) ? e[r] = w.options.mergeArrays ? w.options.uniqueArrayItems ? Array.from(new Set(e[r].concat(t[r]))) : [...e[r], ...t[r]] : t[r] : F(e[r]) && F(t[r]) ? e[r] = w(e[r], t[r]) : !F(e[r]) && F(t[r]) ? e[r] = w(t[r], void 0) : e[r] = t[r] === void 0 ? w.options.allowUndefinedOverrides ? t[r] : e[r] : t[r]);
  }), e;
}, {});
var z = {
  allowUndefinedOverrides: true,
  mergeArrays: true,
  uniqueArrayItems: true
};
w.options = z;
w.withOptions = (n, ...e) => {
  w.options = Object.assign(Object.assign({}, z), n);
  const t = w(...e);
  return w.options = z, t;
};
var ge = 1 * 1024 * 1024;
var we = 2;
var me = 200;
var he = 2e3;
var ye = 3e4;
function pe(n) {
  return n === 429 || n >= 500;
}
function Ae(n) {
  return n instanceof Error && n.name === "AbortError";
}
function Re(n, e, t) {
  const r = Math.min(e * 2 ** n, t), o = Math.floor(Math.random() * 200);
  return Math.min(r + o, t);
}
function ve(n) {
  if (!n)
    return null;
  const e = Number(n);
  if (!Number.isNaN(e))
    return e * 1e3;
  const t = Date.parse(n);
  return Number.isNaN(t) ? null : t - Date.now();
}
function Se(n) {
  try {
    new URL(n);
  } catch {
    throw new Error(`Invalid URL: ${n}`);
  }
}
async function ee(n, e, t) {
  Se(n);
  const r = (t == null ? void 0 : t.maxRetries) ?? we, o = (t == null ? void 0 : t.initialRetryDelayMs) ?? me, s = (t == null ? void 0 : t.maxRetryDelayMs) ?? he, _ = (t == null ? void 0 : t.maxRetryAfterMs) ?? ye, a = (t == null ? void 0 : t.isRetryableStatus) ?? pe, f = (t == null ? void 0 : t.isRetryableError) ?? (() => true), m = (t == null ? void 0 : t.fetch) ?? fetch, d = (l2) => Re(l2, o, s);
  for (let l2 = 0; ; l2++) {
    let b;
    try {
      b = await m(n, e);
    } catch (g2) {
      if (!Ae(g2) && f(g2) && l2 < r) {
        await new Promise((R) => setTimeout(R, d(l2)));
        continue;
      }
      const A = g2 instanceof Error ? g2.message : String(g2);
      throw new Error(`Network error fetching ${n}: ${A}`, {
        cause: g2
      });
    }
    if (!b.ok) {
      if (a(b.status)) {
        const A = ve(b.headers.get("retry-after"));
        if (A !== null) {
          if (A > _)
            throw new Error(`Failed to fetch ${n}: server requested a Retry-After delay of ${Math.ceil(A / 1e3)}s, which exceeds the maximum allowed delay of ${_ / 1e3}s`);
          if (l2 < r) {
            await new Promise((R) => setTimeout(R, Math.max(A, 0)));
            continue;
          }
          throw new Error(`Failed to fetch ${n}: ${b.status} ${b.statusText}`);
        }
        if (l2 < r) {
          await new Promise((R) => setTimeout(R, d(l2)));
          continue;
        }
      }
      throw new Error(`Failed to fetch ${n}: ${b.status} ${b.statusText}`);
    }
    return b;
  }
}
async function k(n, e) {
  const t = (e == null ? void 0 : e.maxResponseBytes) ?? ge, r = await ee(n, void 0, e), o = r.headers.get("content-length");
  if (o !== null && Number(o) > t)
    throw new Error(`Response from ${n} is too large. Max size is ${t} bytes.`);
  const s = await r.text();
  if (s.length > t)
    throw new Error(`Response from ${n} is too large. Max size is ${t} bytes.`);
  return s;
}
function D(n) {
  return Object.entries(n).reduce((t, [r, o]) => (t[xe(r)] = te(o), t), {});
}
function te(n) {
  return Array.isArray(n) ? n.map(te) : typeof n == "object" && n !== null ? D(n) : n;
}
function xe(n) {
  return n.replace(/[A-Z]/g, (e) => `_${e.toLowerCase()}`);
}
var Ie = Object.freeze({
  builder: Object.freeze({
    generateC2paArchive: true
  })
});
function Ee(n) {
  return w(Ie, n ?? {});
}
async function Te(n, e) {
  const t = Ee(n), r = [];
  return t.trust && r.push(q(t.trust, e)), t.cawgTrust && r.push(q(t.cawgTrust, e)), await Promise.all(r), JSON.stringify(D(ne(t)));
}
function ne(n) {
  const { trust: e, cawgTrust: t, ...r } = n, o = [
    ...W(e, "manifest"),
    ...W(t, "cawg")
  ], s = r;
  return (o.length > 0 || e != null && e.trustConfig) && (s.trust = {
    ...o.length > 0 ? { anchors: o } : {},
    ...e != null && e.trustConfig ? { trustConfig: e.trustConfig } : {}
  }), s;
}
function W(n, e) {
  if (!n || n.verifyTrustList === false)
    return [];
  const t = n.trustConfig, r = n.allowedList, o = [];
  return n.userAnchors && o.push({
    trustAnchors: n.userAnchors,
    trustUri: `${e}_user_anchors`,
    trustKind: e,
    ...t ? { trustConfig: t } : {},
    ...r ? { allowedList: r } : {}
  }), n.trustAnchors && o.push({
    trustAnchors: n.trustAnchors,
    trustUri: `${e}_system_anchors`,
    trustKind: e,
    ...t ? { trustConfig: t } : {},
    ...r ? { allowedList: r } : {}
  }), o;
}
function Pe(n) {
  return { trust: { ...n } };
}
function Ce(n) {
  return { cawgTrust: { ...n } };
}
function $e(n) {
  return { verify: { ...n } };
}
function x(...n) {
  return w(...n);
}
function ke(n) {
  return JSON.stringify(D(ne(n)));
}
async function We(n, e) {
  return await (await ee(n, void 0, e)).text();
}
var Fe = [
  "userAnchors",
  "trustAnchors",
  "trustConfig",
  "allowedList"
];
async function q(n, e) {
  const t = (s) => ["userAnchors", "trustAnchors"].includes(s), r = (s) => s.includes("-----BEGIN CERTIFICATE-----"), o = (s) => s.startsWith("http");
  try {
    const s = Object.entries(n).filter(([_]) => Fe.includes(_)).map(async ([_, a]) => {
      if (a && typeof a == "object" && Array.isArray(a)) {
        const f = a.map(async (l2) => {
          if (typeof l2 != "string")
            throw new Error("Expected a string value for array item");
          const b = await k(l2, e);
          if (t(_) && !r(b))
            throw new Error(`Error parsing PEM file at: ${l2}`);
          return b;
        }), d = (await Promise.all(f)).join("");
        n[_] = d;
      } else if (a && typeof a == "string" && o(a)) {
        const f = await k(a, e);
        if (t(_) && !r(f))
          throw new Error(`Error parsing PEM file at: ${a}`);
        n[_] = f;
      } else
        return a;
    });
    await Promise.all(s);
  } catch (s) {
    const _ = s instanceof Error ? s.message : String(s);
    throw new Error(`Failed to resolve trust settings. ${_}`, {
      cause: s
    });
  }
}
var p2 = class {
  constructor(e, t) {
    T(this, "_settings");
    T(this, "_sdkConfig");
    T(this, "_jsonPromise");
    this._settings = e, this._sdkConfig = t;
  }
  /**
   * The SDK config currently attached to this `Context`, if any.
   *
   * To derive a new `Context` with a different SDK config, construct one with
   * `new Context(settings, sdkConfig)`.
   */
  get sdkConfig() {
    return this._sdkConfig;
  }
  /**
   * The settings currently attached to this `Context`, if any.
   *
   * To derive a new `Context` with different settings, construct one with `new Context(settings)`.
   * To combine this `Context`'s settings with more settings, merge them with {@link mergeSettings}
   * first and pass the single, merged result to the constructor.
   */
  get settings() {
    return this._settings;
  }
  /**
   * Resolves this `Context`'s settings (fetching any embedded trust-anchor URLs) and serializes
   * the result for consumption by the WASM/native boundary. A successful result is memoized, so
   * resolution of this Context's settings only happens once. If different fetch-with-retry
   * options need to be provided, callers should create a separate `Context` and then call
   * `toJson()` with the desired options.
   *
   * A failed resolution is not memoized: the next call to `toJson()` tries again from scratch,
   * so a transient failure (e.g. a network error while fetching a trust-anchor URL) doesn't
   * permanently break this `Context`.
   *
   * @param options Optional configurations for fetch-with-retry, used when resolving trust-anchor
   * URLs. Only consulted on the first call, or the first call after a previous failure.
   * @returns A JSON-serialized string of the resolved settings.
   */
  toJson(e) {
    return this._jsonPromise ?? (this._jsonPromise = Te(this.settings, e).catch((t) => {
      throw this._jsonPromise = void 0, t;
    })), this._jsonPromise;
  }
};
var Me = 10 ** 9;
function re(n) {
  return Number.isFinite(n) && n > 0 ? n : Me;
}
function V(n, e) {
  const t = (n == null ? void 0 : n.maxSizeInBytes) ?? e;
  if (!Number.isFinite(t) || t <= 0)
    throw new RangeError(`maxSizeInBytes must be a finite, positive number. Received: ${t}.`);
  return t;
}
var Be = class extends Error {
  /**
   * @param sizeInBytes Size of the asset, in bytes.
   * @param maxSizeInBytes Maximum allowed size, in bytes. `0` (or any other
   * non-finite/negative value) resolves to {@link DEFAULT_MAX_SIZE_IN_BYTES}.
   */
  constructor(e, t) {
    const r = re(t);
    super(`The provided asset was too large. Size: ${e} bytes. Maximum: ${r}.`), this.name = "AssetTooLargeError";
  }
};
function N(n, e) {
  if (!Number.isFinite(n) || n < 0)
    throw new RangeError(`sizeInBytes must be a finite, non-negative number. Received: ${n}.`);
  if (!Number.isFinite(e) || e < 0)
    throw new RangeError(`maxSizeInBytes must be a finite, non-negative number. Received: ${e}.`);
  const t = re(e);
  if (n > t)
    throw new Be(n, t);
}
var G = 10 ** 9;
var L = new FinalizationRegistry(
  async ({ worker: n, id: e }) => {
    await n.tx.reader_free(e);
  }
);
var h2;
var y;
var j = class j2 {
  constructor(e, t) {
    v(this, h2);
    v(this, y);
    S(this, h2, e), S(this, y, t);
  }
  /**
   * Create a {@link Reader} from an asset's format and a blob of its bytes.
   *
   * @param c2pa The `C2pa` instance (from {@link createC2pa}) to create this reader on.
   * @param format Asset format (MIME type or extension), typically `blob.type`. If omitted
   * or empty, the native library will attempt to detect the format from the asset's bytes instead.
   * Always provide the format if known, and only omit this when the caller has no way to determine
   * the asset's format otherwise.
   * @param blob Blob of asset bytes.
   * @param context Optional `Context` configuring this reader's behavior.
   * @returns A {@link Reader} object or null if no C2PA metadata was found.
   * @throws If the asset is too large, or if the `Context` sets an invalid `maxSizeInBytes`.
   */
  static async fromBlob(e, t, r, o = new p2()) {
    N(
      r.size,
      V(o.sdkConfig, G)
    );
    try {
      const s = await o.toJson(), { worker: _ } = e, a = await _.tx.reader_fromBlob(t ?? "", r, s), f = new j2(_, a);
      return L.register(f, { worker: _, id: a }, f), f;
    } catch (s) {
      return Y(s);
    }
  }
  /**
   * Create a {@link Reader} from an initial fragment and a subsequent fragment.
   *
   * @param c2pa The `C2pa` instance (from {@link createC2pa}) to create this reader on.
   * @param format Asset format (MIME type or extension). Unlike {@link fromBlob}, fragmented
   * assets cannot be auto-detected from their bytes, so a format must be supplied.
   * @param init Blob of initial fragment bytes.
   * @param fragment Blob of fragment bytes.
   * @param context Optional `Context` configuring this reader's behavior.
   * @returns A {@link Reader} object or null if no C2PA metadata was found.
   * @throws If the asset is too large, or if the `Context` sets an invalid `maxSizeInBytes`.
   */
  static async fromBlobFragment(e, t, r, o, s = new p2()) {
    const _ = V(
      s.sdkConfig,
      G
    );
    N(r.size, _), N(o.size, _);
    try {
      const a = await s.toJson(), { worker: f } = e, m = await f.tx.reader_fromBlobFragment(
        t,
        r,
        o,
        a
      ), d = new j2(f, m);
      return L.register(d, { worker: f, id: m }, d), d;
    } catch (a) {
      return Y(a);
    }
  }
  /**
   * @returns The label of the active manifest.
   */
  async activeLabel() {
    return await i(this, h2).tx.reader_activeLabel(i(this, y));
  }
  /**
   * @returns The asset's full {@link ManifestStore} containing all its manifests, validation statuses, and the URI of the active manifest.
   */
  async manifestStore() {
    return await i(this, h2).tx.reader_manifestStore(i(this, y));
  }
  /**
   * @returns The asset's active {@link Manifest}.
   */
  async activeManifest() {
    return await i(this, h2).tx.reader_activeManifest(i(this, y));
  }
  /**
   * @returns The asset's full {@link ManifestStore}.
   *
   * @deprecated Use {@link manifestStore} instead.
   */
  async json() {
    const e = await i(this, h2).tx.reader_json(i(this, y));
    return JSON.parse(e);
  }
  /**
   * @returns The asset's manifest store as crJSON.
   */
  async crJson() {
    const e = await i(this, h2).tx.reader_crJson(i(this, y));
    return JSON.parse(e);
  }
  /**
   * Resolves a URI reference to a binary object (e.g. a thumbnail) in the resource store.
   *
   * @param uri URI of the binary object to resolve.
   * @returns A Uint8Array of the resource's bytes.
   *
   * @example Retrieving a thumbnail from the resource store:
   * ```
   * const reader = await Reader.fromBlob(c2pa, blob.type, blob);
   * const activeManifest = await reader.activeManifest();
   * const thumbnailBuffer = await reader.resourceToBytes(activeManifest.thumbnail!.identifier);
   * ```
   */
  async resourceToBytes(e) {
    return await i(this, h2).tx.reader_resourceToBytes(i(this, y), e);
  }
  /**
   * Dispose of this Reader, freeing the memory it occupied and preventing further use.
   * Call this whenever the Reader is no longer needed.
   */
  async free() {
    L.unregister(this), await i(this, h2).tx.reader_free(i(this, y));
  }
};
h2 = /* @__PURE__ */ new WeakMap(), y = /* @__PURE__ */ new WeakMap();
var B = j;
function je(n, e = {}) {
  return {
    fromBlob: (t, r, o = {}) => B.fromBlob(
      n,
      t,
      r,
      new p2(x(e, o))
    ),
    fromBlobFragment: (t, r, o, s = {}) => B.fromBlobFragment(
      n,
      t,
      r,
      o,
      new p2(x(e, s))
    )
  };
}
function Y(n) {
  if (n instanceof Error && n.message === "C2pa(JumbfNotFound)")
    return null;
  throw n;
}
async function H(n) {
  const { alg: e } = n;
  return {
    reserveSize: await n.reserveSize(),
    alg: e
  };
}
async function qe(n, e) {
  return n.worker.tx.encodeSignerPayload(e);
}
function Oe(n, e) {
  const { credentialHolder: t, referencedAssertions: r, roles: o } = n;
  return {
    requestId: e,
    sigType: t.sigType,
    reserveSize: t.reserveSize,
    referencedAssertions: r ?? [],
    roles: o ?? []
  };
}
function X(n) {
  return ie(n).flat();
}
function ie(n) {
  return (n.assertions ?? []).filter((e) => e.label.startsWith("c2pa.actions")).map((e) => {
    const t = e.data;
    return (t == null ? void 0 : t.actions) ?? [];
  });
}
function K(n, e) {
  const t = (e == null ? void 0 : e.identityAssertions) ?? [];
  if (t.length > 1)
    throw new Error(
      "Only one identity assertion is currently supported per signing operation."
    );
  return t.map((r) => {
    const o = n.registerCredentialHolderReceiver(
      r.credentialHolder.sign
    );
    return Oe(r, o);
  });
}
var M2 = new FinalizationRegistry(
  ({ worker: n, id: e }) => {
    n.tx.builder_free(e);
  }
);
var c;
var u;
var E = class E2 {
  constructor(e, t) {
    v(this, c);
    v(this, u);
    S(this, c, e), S(this, u, t);
  }
  /**
   * Create a {@link Builder} with a minimal manifest definition as its initial state.
   *
   * @param c2pa The `C2pa` instance (from {@link createC2pa}) to create this builder on.
   * @param context Optional `Context` configuring this builder's behavior.
   * @returns A {@link Builder} object.
   */
  static async new(e, t = new p2()) {
    const r = await t.toJson(), { worker: o } = e, s = await o.tx.builder_new(r), _ = new E2(o, s);
    return M2.register(_, { worker: o, id: s }, _), _;
  }
  /**
   * Create a {@link Builder} from a {@link ManifestDefinition}.
   *
   * @param c2pa The `C2pa` instance (from {@link createC2pa}) to create this builder on.
   * @param definition The {@link ManifestDefinition} to be used as the builder's initial state.
   * @param context Optional `Context` configuring this builder's behavior.
   * @returns A {@link Builder} object.
   */
  static async fromDefinition(e, t, r = new p2()) {
    const o = JSON.stringify(t), s = await r.toJson(), { worker: _ } = e, a = await _.tx.builder_fromJson(o, s), f = new E2(_, a);
    return M2.register(f, { worker: _, id: a }, f), f;
  }
  /**
   * Create a {@link Builder} from a builder archive (created from {@link Builder.toArchive}).
   *
   * @param c2pa The `C2pa` instance (from {@link createC2pa}) to create this builder on.
   * @param archive Builder archive as a blob.
   * @param context Optional `Context` configuring this builder's behavior.
   * @returns A {@link Builder} object.
   */
  static async fromArchive(e, t, r = new p2()) {
    const o = await r.toJson(), { worker: s } = e, _ = await s.tx.builder_fromArchive(t, o), a = new E2(s, _);
    return M2.register(a, { worker: s, id: _ }, a), a;
  }
  /**
   * Sets the builder "intent."
   *
   * @todo Additional documentation coming soon.
   *
   * @param intent
   */
  async setIntent(e) {
    await i(this, c).tx.builder_setIntent(i(this, u), e);
  }
  /**
   * Add an action to the manifest's actions assertion.
   *
   * @param action Object representing the action to be added.
   */
  async addAction(e) {
    await i(this, c).tx.builder_addAction(i(this, u), e);
  }
  /**
   * Add an assertion to the manifest under the given label.
   *
   * @param label The assertion label (reverse-domain format).
   * @param data The assertion data (any JSON-serializable value).
   */
  async addAssertion(e, t) {
    await i(this, c).tx.builder_addAssertion(i(this, u), e, t);
  }
  /**
   * Replaces the data of every assertion with an exact matching label.
   * `transform` runs once per matching assertion in manifest order. Other assertion
   * fields and positions are preserved. A missing label is a no-op.
   * Returning null or undefined leaves that assertion unchanged.
   * The replacement data must be JSON-serializable and may fail validation at signing time.
   *
   * @param label The exact assertion label to update.
   * @param transform Receives the current data and returns its replacement.
   */
  async updateAssertion(e, t) {
    const o = ((await this.getDefinition()).assertions ?? []).filter((s) => s.label === e).map((s) => t(s.data) ?? s.data);
    await i(this, c).tx.builder_updateAssertionsAt(i(this, u), e, o);
  }
  /**
   * Redact an assertion from an ingredient manifest.
   *
   * Adds the URI to the builder's redaction list and appends a `c2pa.redacted` action
   * with the given reason, as required by the C2PA spec.
   *
   * @param uri JUMBF URI of the assertion to redact.
   * @param reason The {@link C2paReason} for the redaction.
   */
  async addRedaction(e, t) {
    await i(this, c).tx.builder_addRedaction(i(this, u), e, t);
  }
  /**
   * Sets the remote URL for a remote manifest. The manifest is expected to be available at this location.
   *
   * @param url URL pointing to the location the remote manifest will be stored.
   */
  async setRemoteUrl(e) {
    await i(this, c).tx.builder_setRemoteUrl(i(this, u), e);
  }
  /**
   * Sets the state of the no_embed flag.
   * To skip embedding a manifest (e.g. for the remote-only case), set this to `true`.
   *
   * @param noEmbed Value to set the no_embed flag.
   */
  async setNoEmbed(e) {
    await i(this, c).tx.builder_setNoEmbed(i(this, u), e);
  }
  /**
   * Updates a (known) property in the manifest definition.
   * Rejects an unsupported property or value type,
   * or while a sign on this builder is pending.
   */
  async updateManifestProperty(e, t) {
    await i(this, c).tx.builder_updateManifestProperty(i(this, u), e, t);
  }
  /**
   * Set a thumbnail from a blob to be included in the manifest. The blob should represent the asset being signed.
   *
   * @param format Format of the thumbnail
   * @param blob Blob of the thumbnail bytes
   */
  async setThumbnailFromBlob(e, t) {
    await i(this, c).tx.builder_setThumbnailFromBlob(i(this, u), e, t);
  }
  /**
   * Experimental.
   * Retains only the actions for which `keep` returns true.
   *
   * The inception action, `c2pa.created` or `c2pa.opened`, is always kept regardless of `keep`,
   * and is moved to index 0 if needed, so the manifest stays valid per the C2PA spec. Sets
   * `allActionsIncluded = false` when anything is removed. This does not touch ingredients.
   * Call {@link Builder.filterIngredients}, using `filterIngredients(() => false)` to drop all
   * orphans, afterwards if you also want to drop ingredients now orphaned by the removed
   * actions.
   *
   * Unlike the Node binding, Neon, which can invoke the JS predicate synchronously from Rust,
   * the WASM builder lives in a Web Worker. A predicate closure can't be called across the
   * worker boundary, so we evaluate it here on the main thread and send the resulting indices
   * to the worker, where WASM applies the equivalent index-based filter. The action/ingredient
   * ordering here must match what WASM iterates. See `filterActionsAt` and `filterIngredientsAt`.
   *
   * @param keep The action is retained when the predicate returns true.
   */
  async filterActions(e) {
    const t = await i(this, c).tx.builder_getDefinition(
      i(this, u)
    ), o = X(t).reduce((s, _, a) => (e(_) && s.push(a), s), []);
    await i(this, c).tx.builder_filterActionsAt(i(this, u), o);
  }
  /**
   * Experimental.
   * Retains ingredients, then rewrites positional ingredient references so linked actions
   * stay valid.
   *
   * An ingredient is kept if it is referenced by a current action, is a `parentOf` ingredient,
   * or `rescue` returns true for it. `rescue` therefore only ever rescues an otherwise-orphaned
   * ingredient. It can never drop a referenced or lineage ingredient. Call
   * {@link Builder.filterActions} first if you are also removing actions: the keep-set is
   * computed from whatever actions currently remain.
   *
   * @param rescue Can rescue an otherwise-orphaned ingredient by returning true.
   */
  async filterIngredients(e) {
    const o = ((await i(this, c).tx.builder_getDefinition(
      i(this, u)
    )).ingredients ?? []).reduce((s, _, a) => (e(_) && s.push(a), s), []);
    await i(this, c).tx.builder_filterIngredientsAt(i(this, u), o);
  }
  /**
   * Experimental.
   * Retains actions and ingredients together in one step.
   *
   * `rescueIngredient` is evaluated for every ingredient first; any action referencing an
   * ingredient it would rescue is force-kept regardless of `keepAction`.
   *
   * @param keepAction The action is retained when the predicate returns true.
   * @param rescueIngredient Can rescue an otherwise-orphaned ingredient (and the action
   * referencing it) by returning true.
   */
  async filterActionsAndIngredients(e, t) {
    const r = await i(this, c).tx.builder_getDefinition(
      i(this, u)
    ), s = X(r).reduce((f, m, d) => (e(m) && f.push(d), f), []), a = (r.ingredients ?? []).reduce(
      (f, m, d) => (t(m) && f.push(d), f),
      []
    );
    await i(this, c).tx.builder_filterActionsAndIngredientsAt(
      i(this, u),
      s,
      a
    );
  }
  /**
   * Replaces the actions in the `c2pa.actions`/`c2pa.actions.v2` assertions.
   *
   * A manifest can carry more than one actions assertion (the created-list and
   * gathered-list entries are distinct assertions). `transform` is therefore
   * invoked once per actions assertion, in positional order, with that
   * assertion's own actions.
   *
   * A no-op if there is no actions assertion. Use `addAction` for those.
   *
   * The returned list is written back as is.
   * `transform` can therefore produce an actions array that fails
   * validation at signing time, for example by removing the inception action
   * (`c2pa.created`/`c2pa.opened`) or moving it out of first position.
   *
   * @param transform Receives one assertion's actions and returns its full replacement list.
   */
  async updateActions(e) {
    const t = await i(this, c).tx.builder_getDefinition(
      i(this, u)
    ), o = ie(t).map((s) => e(s));
    await i(this, c).tx.builder_updateActionsAt(i(this, u), o);
  }
  /**
   * Add an ingredient to the builder from a definition only.
   *
   * @param ingredientDefinition {@link Ingredient} definition.
   */
  async addIngredient(e) {
    const t = JSON.stringify(e);
    await i(this, c).tx.builder_addIngredient(i(this, u), t);
  }
  /**
   * Add an ingredient to the builder from a definition, format, and blob.
   * Values specified in the ingredient definition will be merged with the ingredient, and these values take precendence.
   *
   * @param ingredientDefinition {@link Ingredient} definition.
   * @param format Format of the ingredient.
   * @param blob Blob of the ingredient's bytes.
   */
  async addIngredientFromBlob(e, t, r) {
    const o = JSON.stringify(e);
    await i(this, c).tx.builder_addIngredientFromBlob(i(this, u), o, t, r);
  }
  /**
   * Add a resource to the builder's resource store with an ID and blob of the resource's bytes.
   *
   * @param resourceId ID associated with the resource being added.
   * @param blob Blob of the resource's bytes.
   */
  async addResourceFromBlob(e, t) {
    await i(this, c).tx.builder_addResourceFromBlob(i(this, u), e, t);
  }
  /**
   * Gets the current manifest definition held by the builder.
   *
   * @returns The {@link ManifestDefinition} held by the builder.
   */
  async getDefinition() {
    return await i(this, c).tx.builder_getDefinition(i(this, u));
  }
  /**
   * Save the builder into .c2pa format.
   * This "archive" can be added to as an ingredient with {@link addIngredientFromBlob}
   *
   * @returns A builder archive in application/c2pa format.
   */
  async toArchive() {
    return await i(this, c).tx.builder_toArchive(i(this, u));
  }
  /**
   * Sign an asset.
   *
   * @param signer The signer to use for the manifest's claim signature.
   * @param format The format (MIME type) of the asset.
   * @param blob The asset bytes.
   * @param options Optional {@link SignOptions}. `identityAssertions` attaches
   * one or more CAWG identity assertions (`cawg.identity`) to the manifest.
   *
   * @todo Docs coming soon
   */
  async sign(e, t, r, o) {
    const s = await H(e), _ = i(this, c).registerSignReceiver(e.sign), a = K(
      i(this, c),
      o
    );
    return await i(this, c).tx.builder_sign(
      i(this, u),
      _,
      s,
      a,
      t,
      r
    );
  }
  /**
   * Sign an asset and get both the signed asset bytes and the manifest bytes.
   *
   * @param signer The signer to use for the manifest's claim signature.
   * @param format The format (MIME type) of the asset.
   * @param blob The asset bytes.
   * @param options Optional {@link SignOptions}. `identityAssertions` attaches
   * one or more CAWG identity assertions (`cawg.identity`) to the manifest.
   *
   * @todo Docs coming soon
   */
  async signAndGetManifestBytes(e, t, r, o) {
    const s = await H(e), _ = i(this, c).registerSignReceiver(e.sign), a = K(
      i(this, c),
      o
    );
    return await i(this, c).tx.builder_signAndGetManifestBytes(
      i(this, u),
      _,
      s,
      a,
      t,
      r
    );
  }
  /**
   * Dispose of this Builder, freeing the memory it occupied and preventing further use. Call this whenever the Builder is no longer needed.
   */
  async free() {
    M2.unregister(this), await i(this, c).tx.builder_free(i(this, u));
  }
};
c = /* @__PURE__ */ new WeakMap(), u = /* @__PURE__ */ new WeakMap();
var I = E;
function Ue(n, e = {}) {
  return {
    new: (t = {}) => I.new(n, new p2(x(e, t))),
    fromDefinition: (t, r = {}) => I.fromDefinition(
      n,
      t,
      new p2(x(e, r))
    ),
    fromArchive: (t, r = {}) => I.fromArchive(
      n,
      t,
      new p2(x(e, r))
    )
  };
}
async function Ve(n) {
  const { wasmSrc: e, workerSrc: t, settings: r } = n, o = typeof e == "string" ? await Ne(e) : e, s = await fe({ wasm: o, workerSrc: t }), _ = {
    worker: s,
    reader: void 0,
    builder: void 0,
    dispose: s.terminate
  };
  return _.reader = je(_, r), _.builder = Ue(_, r), _;
}
async function Ne(n) {
  const e = await fetch(n, { integrity: le });
  return await WebAssembly.compileStreaming(e);
}
export {
  Be as AssetTooLargeError,
  I as Builder,
  p2 as Context,
  me as DEFAULT_INITIAL_RETRY_DELAY_MS,
  ge as DEFAULT_MAX_RESPONSE_BYTES,
  we as DEFAULT_MAX_RETRIES,
  ye as DEFAULT_MAX_RETRY_AFTER_MS,
  he as DEFAULT_MAX_RETRY_DELAY_MS,
  Me as DEFAULT_MAX_SIZE_IN_BYTES,
  Ie as DEFAULT_SETTINGS,
  B as Reader,
  Ve as createC2pa,
  Ce as createCawgTrustSettings,
  Pe as createTrustSettings,
  $e as createVerifySettings,
  pe as defaultIsRetryableStatus,
  qe as encodeSignerPayload,
  k as fetchWithRetry,
  ee as fetchWithRetryRaw,
  We as loadSettingsFromUrl,
  x as mergeSettings,
  V as resolveConfiguredMaxSizeInBytes,
  Te as resolveSettings,
  q as resolveTrustSettings,
  ke as settingsToJson,
  D as snakeCaseify,
  N as validateAssetSize,
  Ee as withDefaultSettings
};
