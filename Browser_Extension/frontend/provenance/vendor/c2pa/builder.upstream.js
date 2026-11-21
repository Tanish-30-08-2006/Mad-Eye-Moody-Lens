var j = (r) => {
  throw TypeError(r);
};
var T = (r, e, t) => e.has(r) || j("Cannot " + t);
var n = (r, e, t) => (T(r, e, "read from private field"), t ? t.call(r) : e.get(r)), h = (r, e, t) => e.has(r) ? j("Cannot add the same private member more than once") : e instanceof WeakSet ? e.add(r) : e.set(r, t), y = (r, e, t, i) => (T(r, e, "write to private field"), i ? i.call(r, t) : e.set(r, t), t);
import { channel as W, transfer as k } from "highgain";
import { Context as p, validateAssetSize as S, resolveConfiguredMaxSizeInBytes as z } from "@contentauth/c2pa-utilities";
const { createTx: V, rx: re } = W(), { createTx: _e, rx: G } = W("worker"), q = '(function(){"use strict";class y{static __wrap(e){const t=Object.create(y.prototype);return t.__wbg_ptr=e,z.register(t,t.__wbg_ptr,t),t}__destroy_into_raw(){const e=this.__wbg_ptr;return this.__wbg_ptr=0,z.unregister(this),e}free(){const e=this.__destroy_into_raw();o.__wbg_wasmbuilder_free(e,0)}addAction(e){const t=o.wasmbuilder_addAction(this.__wbg_ptr,e);if(t[1])throw b(t[0])}addAssertion(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_addAssertion(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}addIngredientFromBlob(e,t,n){const _=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a,s=d(t,o.__wbindgen_malloc,o.__wbindgen_realloc),i=a;return o.wasmbuilder_addIngredientFromBlob(this.__wbg_ptr,_,c,s,i,n)}addIngredient(e){const t=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=a,_=o.wasmbuilder_addIngredient(this.__wbg_ptr,t,n);if(_[1])throw b(_[0])}addRedaction(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_addRedaction(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}addResourceFromBlob(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_addResourceFromBlob(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}filterActionsAndIngredientsAt(e,t){const n=E(e,o.__wbindgen_malloc),_=a,c=E(t,o.__wbindgen_malloc),s=a,i=o.wasmbuilder_filterActionsAndIngredientsAt(this.__wbg_ptr,n,_,c,s);if(i[1])throw b(i[0])}filterActionsAt(e){const t=E(e,o.__wbindgen_malloc),n=a,_=o.wasmbuilder_filterActionsAt(this.__wbg_ptr,t,n);if(_[1])throw b(_[0])}filterIngredientsAt(e){const t=E(e,o.__wbindgen_malloc),n=a,_=o.wasmbuilder_filterIngredientsAt(this.__wbg_ptr,t,n);if(_[1])throw b(_[0])}static fromArchive(e,t){var n=w(t)?0:d(t,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a;const c=o.wasmbuilder_fromArchive(e,n,_);if(c[2])throw b(c[1]);return y.__wrap(c[0])}static fromJson(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a;var c=w(t)?0:d(t,o.__wbindgen_malloc,o.__wbindgen_realloc),s=a;const i=o.wasmbuilder_fromJson(n,_,c,s);if(i[2])throw b(i[1]);return y.__wrap(i[0])}getDefinition(){const e=o.wasmbuilder_getDefinition(this.__wbg_ptr);if(e[2])throw b(e[1]);return b(e[0])}static new(e){var t=w(e)?0:d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=a;const _=o.wasmbuilder_new(t,n);if(_[2])throw b(_[1]);return y.__wrap(_[0])}setIntent(e){const t=o.wasmbuilder_setIntent(this.__wbg_ptr,e);if(t[1])throw b(t[0])}setNoEmbed(e){o.wasmbuilder_setNoEmbed(this.__wbg_ptr,e)}setRemoteUrl(e){const t=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=a;o.wasmbuilder_setRemoteUrl(this.__wbg_ptr,t,n)}setThumbnailFromBlob(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_setThumbnailFromBlob(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}signAndGetManifestBytes(e,t,n,_){const c=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),s=a;return o.wasmbuilder_signAndGetManifestBytes(this.__wbg_ptr,e,t,c,s,_)}sign(e,t,n,_){const c=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),s=a;return o.wasmbuilder_sign(this.__wbg_ptr,e,t,c,s,_)}toArchive(){const e=o.wasmbuilder_toArchive(this.__wbg_ptr);if(e[2])throw b(e[1]);return b(e[0])}updateActionsAt(e){const t=o.wasmbuilder_updateActionsAt(this.__wbg_ptr,e);if(t[1])throw b(t[0])}updateAssertionsAt(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_updateAssertionsAt(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}updateManifestProperty(e,t){const n=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),_=a,c=o.wasmbuilder_updateManifestProperty(this.__wbg_ptr,n,_,t);if(c[1])throw b(c[0])}}Symbol.dispose&&(y.prototype[Symbol.dispose]=y.prototype.free);class F{static __wrap(e){const t=Object.create(F.prototype);return t.__wbg_ptr=e,N.register(t,t.__wbg_ptr,t),t}__destroy_into_raw(){const e=this.__wbg_ptr;return this.__wbg_ptr=0,N.unregister(this),e}free(){const e=this.__destroy_into_raw();o.__wbg_wasmreader_free(e,0)}activeLabel(){const e=o.wasmreader_activeLabel(this.__wbg_ptr);let t;return e[0]!==0&&(t=p(e[0],e[1]),o.__wbindgen_free(e[0],e[1]*1,1)),t}activeManifest(){const e=o.wasmreader_activeManifest(this.__wbg_ptr);if(e[2])throw b(e[1]);return b(e[0])}crJson(){let e,t;try{const n=o.wasmreader_crJson(this.__wbg_ptr);return e=n[0],t=n[1],p(n[0],n[1])}finally{o.__wbindgen_free(e,t,1)}}static fromBlobFragment(e,t,n,_){const c=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),s=a;var i=w(_)?0:d(_,o.__wbindgen_malloc,o.__wbindgen_realloc),u=a;return o.wasmreader_fromBlobFragment(c,s,t,n,i,u)}static fromBlob(e,t,n){const _=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a;var s=w(n)?0:d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),i=a;return o.wasmreader_fromBlob(_,c,t,s,i)}static fromBytes(e,t,n){const _=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a,s=ee(t,o.__wbindgen_malloc),i=a;var u=w(n)?0:d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),g=a;return o.wasmreader_fromBytes(_,c,s,i,u,g)}json(){let e,t;try{const n=o.wasmreader_json(this.__wbg_ptr);return e=n[0],t=n[1],p(n[0],n[1])}finally{o.__wbindgen_free(e,t,1)}}manifestStore(){const e=o.wasmreader_manifestStore(this.__wbg_ptr);if(e[2])throw b(e[1]);return b(e[0])}resourceToBytes(e){const t=d(e,o.__wbindgen_malloc,o.__wbindgen_realloc),n=a,_=o.wasmreader_resourceToBytes(this.__wbg_ptr,t,n);if(_[2])throw b(_[1]);return b(_[0])}}Symbol.dispose&&(F.prototype[Symbol.dispose]=F.prototype.free);function C(r){const e=o.encodeSignerPayload(r);if(e[3])throw b(e[2]);var t=A(e[0],e[1]).slice();return o.__wbindgen_free(e[0],e[1]*1,1),t}function G(){return{__proto__:null,"./c2pa_bg.js":{__proto__:null,__wbg_Error_30c8987f7c2ed4e2:function(e,t){return Error(p(e,t))},__wbg_Number_14af1003b8dd5ead:function(e){return Number(e)},__wbg_String_8564e559799eccda:function(e,t){const n=String(t),_=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg___wbindgen_bigint_get_as_i64_a2383202b9353e4c:function(e,t){const n=t,_=typeof n=="bigint"?n:void 0;m().setBigInt64(e+8,w(_)?BigInt(0):_,!0),m().setInt32(e+0,!w(_),!0)},__wbg___wbindgen_boolean_get_5b446f51afd21013:function(e){const t=e,n=typeof t=="boolean"?t:void 0;return w(n)?16777215:n?1:0},__wbg___wbindgen_debug_string_4687d8d8c2017d52:function(e,t){const n=U(t),_=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg___wbindgen_in_92f62ee1427d9e49:function(e,t){return e in t},__wbg___wbindgen_is_bigint_b123553bed3bb382:function(e){return typeof e=="bigint"},__wbg___wbindgen_is_function_1f9d30630b8b1d3d:function(e){return typeof e=="function"},__wbg___wbindgen_is_null_e343b7d08827ba72:function(e){return e===null},__wbg___wbindgen_is_object_3c45d4f2dde4e749:function(e){const t=e;return typeof t=="object"&&t!==null},__wbg___wbindgen_is_string_90b56bc79aad6f6c:function(e){return typeof e=="string"},__wbg___wbindgen_is_undefined_8865fb403f8fe9d8:function(e){return e===void 0},__wbg___wbindgen_jsval_eq_02babf21faa37971:function(e,t){return e===t},__wbg___wbindgen_jsval_loose_eq_677f21e468d6b461:function(e,t){return e==t},__wbg___wbindgen_number_get_2e0e7dee9f701a71:function(e,t){const n=t,_=typeof n=="number"?n:void 0;m().setFloat64(e+8,w(_)?0:_,!0),m().setInt32(e+0,!w(_),!0)},__wbg___wbindgen_string_get_0380ccaa2f57f0d9:function(e,t){const n=t,_=typeof n=="string"?n:void 0;var c=w(_)?0:d(_,o.__wbindgen_malloc,o.__wbindgen_realloc),s=a;m().setInt32(e+4,s,!0),m().setInt32(e+0,c,!0)},__wbg___wbindgen_throw_41e9ee4f547fc59a:function(e,t){throw new Error(p(e,t))},__wbg__wbg_cb_unref_dcc1a90847f04c41:function(e){e._wbg_cb_unref()},__wbg_abort_334e7f918b7c5047:function(e,t){e.abort(t)},__wbg_abort_f78b99d80248bacb:function(e){e.abort()},__wbg_append_1938ed58fb5613b8:function(){return l(function(e,t,n,_,c){e.append(p(t,n),p(_,c))},arguments)},__wbg_arrayBuffer_f07be74819944ea2:function(){return l(function(e){return e.arrayBuffer()},arguments)},__wbg_byteLength_9f985b8373f1f3fe:function(e){return e.byteLength},__wbg_call_187d372bd5fdd4aa:function(){return l(function(e,t,n){return e.call(t,n)},arguments)},__wbg_call_6137034ef55c9d0f:function(){return l(function(e,t){return e.call(t)},arguments)},__wbg_clearTimeout_6b8d9a38b9263d65:function(e){return clearTimeout(e)},__wbg_crypto_38df2bab126b63dc:function(e){return e.crypto},__wbg_done_b41a1d26cdb37fb6:function(e){return e.done},__wbg_entries_fb6397112b1de25f:function(e){return Object.entries(e)},__wbg_error_757e9472f8410341:function(e,t){let n,_;try{n=e,_=t,console.error(p(e,t))}finally{o.__wbindgen_free(n,_,1)}},__wbg_fetch_9dad4fe911207b37:function(e){return fetch(e)},__wbg_fetch_efc64baf325b084d:function(e,t){return e.fetch(t)},__wbg_from_296ca31f8d0f1c52:function(e){return Array.from(e)},__wbg_getRandomValues_436a51d0629d84e1:function(){return l(function(e,t){globalThis.crypto.getRandomValues(A(e,t))},arguments)},__wbg_getRandomValues_a608c4436c19407a:function(){return l(function(e,t){globalThis.crypto.getRandomValues(A(e,t))},arguments)},__wbg_getRandomValues_a678b7300e8ed57f:function(){return l(function(e,t){globalThis.crypto.getRandomValues(A(e,t))},arguments)},__wbg_getRandomValues_c44a50d8cfdaebeb:function(){return l(function(e,t){e.getRandomValues(t)},arguments)},__wbg_getTime_f5a55efff2585d5d:function(e){return e.getTime()},__wbg_get_31af05bd4842a84f:function(){return l(function(e,t){return Reflect.get(e,t)},arguments)},__wbg_get_658f6698067d9515:function(){return l(function(e,t){return Reflect.get(e,t)},arguments)},__wbg_get_6c896e0571ddae51:function(e,t){return e[t>>>0]},__wbg_get_unchecked_288889d017702237:function(e,t){return e[t>>>0]},__wbg_get_with_ref_key_6412cf3094599694:function(e,t){return e[t]},__wbg_has_5d6706e5209576c1:function(){return l(function(e,t){return Reflect.has(e,t)},arguments)},__wbg_headers_eba93595f8944c2f:function(e){return e.headers},__wbg_instanceof_ArrayBuffer_a99f175873e5d9b8:function(e){let t;try{t=e instanceof ArrayBuffer}catch{t=!1}return t},__wbg_instanceof_Map_b2611749102d7ba3:function(e){let t;try{t=e instanceof Map}catch{t=!1}return t},__wbg_instanceof_Promise_e1dc6893aa1ece28:function(e){let t;try{t=e instanceof Promise}catch{t=!1}return t},__wbg_instanceof_Response_b8758567269c30b2:function(e){let t;try{t=e instanceof Response}catch{t=!1}return t},__wbg_instanceof_Uint8Array_828cef2aaacafc31:function(e){let t;try{t=e instanceof Uint8Array}catch{t=!1}return t},__wbg_isArray_e15a2ff68ffdbef2:function(e){return Array.isArray(e)},__wbg_isSafeInteger_717808ad6a54bd9e:function(e){return Number.isSafeInteger(e)},__wbg_iterator_e3c31c892080e444:function(){return Symbol.iterator},__wbg_length_7f3c00c40364105e:function(e){return e.length},__wbg_length_d4bdea10311bd9cf:function(e){return e.length},__wbg_msCrypto_bd5a034af96bcba6:function(e){return e.msCrypto},__wbg_new_0_72d020f0c63443d4:function(){return new Date},__wbg_new_1dbf7428bba60a42:function(e){return new Uint8Array(e)},__wbg_new_227d7c05414eb861:function(){return new Error},__wbg_new_28744009d011f847:function(){return new Map},__wbg_new_2e41357094e99294:function(){return l(function(){return new AbortController},arguments)},__wbg_new_617a8cdb8bb1130e:function(){return new Object},__wbg_new_83ca405eae412a62:function(){return l(function(){return new Headers},arguments)},__wbg_new_9ffe4dece67ce9fc:function(){return l(function(){return new FileReaderSync},arguments)},__wbg_new_ee2291f50781bf1d:function(){return new Array},__wbg_new_from_slice_9a868026ffa4208a:function(e,t){return new Uint8Array(A(e,t))},__wbg_new_typed_b01cb72a8af741a3:function(e,t){try{var n={a:e,b:t},_=(s,i)=>{const u=n.a;n.a=0;try{return X(u,n.b,s,i)}finally{n.a=u}};return new Promise(_)}finally{n.a=0}},__wbg_new_with_length_3da0ad195f6f63ba:function(e){return new Uint8Array(e>>>0)},__wbg_new_with_str_and_init_4618dee4e950224f:function(){return l(function(e,t,n){return new Request(p(e,t),n)},arguments)},__wbg_next_33784799010f1bbe:function(e){return e.next},__wbg_next_f4aac29c42af995c:function(){return l(function(e){return e.next()},arguments)},__wbg_node_84ea875411254db1:function(e){return e.node},__wbg_now_aa4ccb83129e9e55:function(){return Date.now()},__wbg_now_e7c6795a7f81e10f:function(e){return e.now()},__wbg_performance_3fcf6e32a7e1ed0a:function(e){return e.performance},__wbg_process_44c7a14e11e9f69e:function(e){return e.process},__wbg_prototypesetcall_bc27214492979395:function(e,t,n){Uint8Array.prototype.set.call(A(e,t),n)},__wbg_queueMicrotask_9833f9a49df95a49:function(e){return e.queueMicrotask},__wbg_queueMicrotask_a72f977e97f23c5f:function(e){queueMicrotask(e)},__wbg_randomFillSync_6c25eac9869eb53c:function(){return l(function(e,t){e.randomFillSync(t)},arguments)},__wbg_readAsArrayBuffer_14bc98cc9cdf7c0b:function(){return l(function(e,t){return e.readAsArrayBuffer(t)},arguments)},__wbg_require_b4edbdcf3e2a1ef0:function(){return l(function(){return module.require},arguments)},__wbg_resolve_0076e10020304ede:function(e){return Promise.resolve(e)},__wbg_setTimeout_f757f00851f76c42:function(e,t){return setTimeout(e,t)},__wbg_set_575d3ddb70fe831d:function(e,t,n){e.set(A(t,n))},__wbg_set_6ae97e73113c4f0b:function(e,t,n){return e.set(t,n)},__wbg_set_6be42768c690e380:function(e,t,n){e[t]=n},__wbg_set_bea140a88be9b277:function(e,t,n){e[t>>>0]=n},__wbg_set_body_1fb0f1008bfc7df6:function(e,t){e.body=t},__wbg_set_cache_7507c4cc5938ccc7:function(e,t){e.cache=Y[t]},__wbg_set_credentials_e0dcce31ca532b7d:function(e,t){e.credentials=K[t]},__wbg_set_headers_40ad33dcf016613f:function(e,t){e.headers=t},__wbg_set_method_dcb32343247ec427:function(e,t,n){e.method=p(t,n)},__wbg_set_mode_74e772635acb96ec:function(e,t){e.mode=Q[t]},__wbg_set_signal_2dbd377604627f26:function(e,t){e.signal=t},__wbg_signal_e5a49a2d9c65b7f6:function(e){return e.signal},__wbg_size_8f1c0b1a1fbb3810:function(e){return e.size},__wbg_slice_afd8274aed4149c0:function(){return l(function(e,t,n){return e.slice(t,n)},arguments)},__wbg_stack_3b0d974bbf31e44f:function(e,t){const n=t.stack,_=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg_static_accessor_GLOBAL_266715b9d96ba635:function(){const e=typeof global>"u"?null:global;return w(e)?0:R(e)},__wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179:function(){const e=typeof globalThis>"u"?null:globalThis;return w(e)?0:R(e)},__wbg_static_accessor_SELF_0b583911f537483a:function(){const e=typeof self>"u"?null:self;return w(e)?0:R(e)},__wbg_static_accessor_WINDOW_d7f903d1508cbdc4:function(){const e=typeof window>"u"?null:window;return w(e)?0:R(e)},__wbg_status_ce0a98d3c57125f3:function(e){return e.status},__wbg_stringify_52ff602c1cc4fbb6:function(){return l(function(e){return JSON.stringify(e)},arguments)},__wbg_subarray_002b94d5e13d1411:function(e,t,n){return e.subarray(t>>>0,n>>>0)},__wbg_then_c949d5a25a4e78f8:function(e,t,n){return e.then(t,n)},__wbg_then_e71170d78fcf8954:function(e,t){return e.then(t)},__wbg_url_8e28edeab4cd6bed:function(e,t){const n=t.url,_=d(n,o.__wbindgen_malloc,o.__wbindgen_realloc),c=a;m().setInt32(e+4,c,!0),m().setInt32(e+0,_,!0)},__wbg_valueOf_6abcff09c8156bb6:function(e){return e.valueOf()},__wbg_value_f3c585ee8f5ba40c:function(e){return e.value},__wbg_versions_276b2795b1c6a219:function(e){return e.versions},__wbg_wasmreader_new:function(e){return F.__wrap(e)},__wbindgen_generic_0000000000000001:function(e,t){return L(e,t,H)},__wbindgen_generic_0000000000000002:function(e,t){return L(e,t,$)},__wbindgen_generic_0000000000000003:function(e){return e},__wbindgen_generic_0000000000000004:function(e){return e},__wbindgen_generic_0000000000000005:function(e,t){return A(e,t)},__wbindgen_generic_0000000000000006:function(e,t){return p(e,t)},__wbindgen_generic_0000000000000007:function(e){return BigInt.asUintN(64,e)},__wbindgen_generic_0000000000000008:function(e,t){var n=A(e,t).slice();return o.__wbindgen_free(e,t*1,1),n},__wbindgen_init_externref_table:function(){const e=o.__wbindgen_externrefs,t=e.grow(4);e.set(0,void 0),e.set(t+0,void 0),e.set(t+1,null),e.set(t+2,!0),e.set(t+3,!1)}}}}function $(r,e){o.wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke_______true_(r,e)}function H(r,e,t){const n=o.wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke___wasm_bindgen_cb414c02e4f83cd6___JsValue__core_d941ad8722425d2e___result__Result_____wasm_bindgen_cb414c02e4f83cd6___JsError___true_(r,e,t);if(n[1])throw b(n[0])}function X(r,e,t,n){o.wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke___js_sys_1746cd361478c686___Function_fn_wasm_bindgen_cb414c02e4f83cd6___JsValue_____wasm_bindgen_cb414c02e4f83cd6___sys__Undefined___js_sys_1746cd361478c686___Function_fn_wasm_bindgen_cb414c02e4f83cd6___JsValue_____wasm_bindgen_cb414c02e4f83cd6___sys__Undefined_______true_(r,e,t,n)}const Y=["default","no-store","reload","no-cache","force-cache","only-if-cached"],K=["omit","same-origin","include"],Q=["same-origin","no-cors","cors","navigate"],z=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(r=>o.__wbg_wasmbuilder_free(r,1)),N=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(r=>o.__wbg_wasmreader_free(r,1));typeof FinalizationRegistry>"u"||new FinalizationRegistry(r=>o.__wbg_wasmsigner_free(r,1));function R(r){const e=o.__externref_table_alloc();return o.__wbindgen_externrefs.set(e,r),e}const J=typeof FinalizationRegistry>"u"?{register:()=>{},unregister:()=>{}}:new FinalizationRegistry(r=>o.__wbindgen_destroy_closure(r.a,r.b));function U(r){const e=typeof r;if(e=="number"||e=="boolean"||r==null)return`${r}`;if(e=="string")return`"${r}"`;if(e=="symbol"){const _=r.description;return _==null?"Symbol":`Symbol(${_})`}if(e=="function"){const _=r.name;return typeof _=="string"&&_.length>0?`Function(${_})`:"Function"}if(Array.isArray(r)){const _=r.length;let c="[";_>0&&(c+=U(r[0]));for(let s=1;s<_;s++)c+=", "+U(r[s]);return c+="]",c}const t=/\\[object ([^\\]]+)\\]/.exec(toString.call(r));let n;if(t&&t.length>1)n=t[1];else return toString.call(r);if(n=="Object")try{return"Object("+JSON.stringify(r)+")"}catch{return"Object"}return r instanceof Error?`${r.name}: ${r.message}\n${r.stack}`:n}function A(r,e){return r=r>>>0,S().subarray(r/1,r/1+e)}let M=null;function m(){return(M===null||M.buffer.detached===!0||M.buffer.detached===void 0&&M.buffer!==o.memory.buffer)&&(M=new DataView(o.memory.buffer)),M}function p(r,e){return ne(r>>>0,e)}let B=null;function Z(){return(B===null||B.byteLength===0)&&(B=new Uint32Array(o.memory.buffer)),B}let T=null;function S(){return(T===null||T.byteLength===0)&&(T=new Uint8Array(o.memory.buffer)),T}function l(r,e){try{return r.apply(this,e)}catch(t){const n=R(t);o.__wbindgen_exn_store(n)}}function w(r){return r==null}function L(r,e,t){const n={a:r,b:e,cnt:1},_=(...c)=>{n.cnt++;const s=n.a;n.a=0;try{return t(s,n.b,...c)}finally{n.a=s,_._wbg_cb_unref()}};return _._wbg_cb_unref=()=>{--n.cnt===0&&(o.__wbindgen_destroy_closure(n.a,n.b),n.a=0,J.unregister(n))},J.register(_,n,n),_}function E(r,e){const t=e(r.length*4,4)>>>0;return Z().set(r,t/4),a=r.length,t}function ee(r,e){const t=e(r.length*1,1)>>>0;return S().set(r,t/1),a=r.length,t}function d(r,e,t){if(t===void 0){const i=j.encode(r),u=e(i.length,1)>>>0;return S().subarray(u,u+i.length).set(i),a=i.length,u}let n=r.length,_=e(n,1)>>>0;const c=S();let s=0;for(;s<n;s++){const i=r.charCodeAt(s);if(i>127)break;c[_+s]=i}if(s!==n){s!==0&&(r=r.slice(s)),_=t(_,n,n=s+r.length*3,1)>>>0;const i=S().subarray(_+s,_+n),u=j.encodeInto(r,i);s+=u.written,_=t(_,n,s,1)>>>0}return a=s,_}function b(r){const e=o.__wbindgen_externrefs.get(r);return o.__externref_table_dealloc(r),e}let O=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0});O.decode();const te=2146435072;let x=0;function ne(r,e){return x+=e,x>=te&&(O=new TextDecoder("utf-8",{ignoreBOM:!0,fatal:!0}),O.decode(),x=e),O.decode(S().subarray(r,r+e))}const j=new TextEncoder;"encodeInto"in j||(j.encodeInto=function(r,e){const t=j.encode(r);return e.set(t),{read:r.length,written:t.length}});let a=0,o;function re(r,e){return o=r.exports,M=null,B=null,T=null,o.__wbindgen_start(),o}function _e(r){if(o!==void 0)return o;r!==void 0&&(Object.getPrototypeOf(r)===Object.prototype?{module:r}=r:console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));const e=G();r instanceof WebAssembly.Module||(r=new WebAssembly.Module(r));const t=new WebAssembly.Instance(r,e);return re(t)}function V(){let r=0;const e=new Map;return{add(t){const n=r++;return e.set(n,t),n},get(t){const n=e.get(t);if(!n)throw new Error("Attempted to use an object that has been freed");return n},remove(t){return e.delete(t)}}}const D=Symbol("transfer");function v(r,e){return{type:D,value:r,transfer:e?Array.isArray(e)?e:[e]:[r]}}function P(r){return!!(r&&typeof r=="object"&&Reflect.get(r,"type")===D)}function W(r="default"){return{createTx(e){const t=new Map,n=e??self;return n.addEventListener("message",_=>{const{data:c}=_;if(c.channelName!==r)return;const{id:s,result:i,error:u}=c,g=t.get(s);g&&(u?g.reject(u):g.resolve(i),t.delete(s))}),new Proxy({},{get(_,c){return(...s)=>{const i=oe(),u=[],g=[];return s.forEach(I=>{P(I)?(u.push(I.value),g.push(...I.transfer)):u.push(I)}),n.postMessage({method:c,args:u,id:i,channelName:r},{transfer:g}),new Promise((I,ue)=>{t.set(i,{resolve:I,reject:ue})})}}})},rx(e,t){const n=t??self;n.addEventListener("message",async _=>{const{data:c}=_;if(c.channelName!==r)return;const{method:s,args:i,id:u}=c;try{const g=await e[s](...i);P(g)?n.postMessage({result:g.value,id:u,channelName:r},{transfer:g.transfer}):n.postMessage({result:g,id:u,channelName:r})}catch(g){n.postMessage({error:g,id:u,channelName:r})}})}}}function oe(){return new Array(4).fill(0).map(()=>Math.floor(Math.random()*Number.MAX_SAFE_INTEGER).toString(16)).join("-")}const{rx:ce}=W(),{createTx:se}=W("worker");function ie(r){if(!(r!=null&&r.manifests))return r;const e=r.manifests,t=Object.assign(Object.create(null),e),n=Object.getPrototypeOf(e);return n!==null&&n!==Object.prototype&&(t.__proto__=n),r.manifests=t,r}const h=V(),f=V(),k=se();function q(r){return r.map(e=>({sigType:e.sigType,reserveSize:e.reserveSize,referencedAssertions:e.referencedAssertions,roles:e.roles,sign:async t=>{const n=t.referencedAssertions.map(c=>c.hash.buffer);return await k.cawgSign(e.requestId,v(t,n))}}))}ce(ae({async initWorker(r){_e({module:r})},encodeSignerPayload(r){const e=C(r);return v(e,e.buffer)},async reader_fromBlob(r,e,t){const n=await F.fromBlob(r,e,t);return h.add(n)},async reader_fromBlobFragment(r,e,t,n){const _=await F.fromBlobFragment(r,e,t,n);return h.add(_)},reader_activeLabel(r){return h.get(r).activeLabel()??null},reader_manifestStore(r){const e=h.get(r);return ie(e.manifestStore())},reader_activeManifest(r){return h.get(r).activeManifest()},reader_json(r){return h.get(r).json()},reader_crJson(r){return h.get(r).crJson()},reader_resourceToBytes(r,e){const n=h.get(r).resourceToBytes(e);return v(n,n.buffer)},reader_free(r){h.get(r).free(),h.remove(r)},builder_new(r){const e=y.new(r);return f.add(e)},builder_fromJson(r,e){const t=y.fromJson(r,e);return f.add(t)},builder_fromArchive(r,e){const t=y.fromArchive(r,e);return f.add(t)},builder_setIntent(r,e){f.get(r).setIntent(e)},builder_addAction(r,e){f.get(r).addAction(e)},builder_addAssertion(r,e,t){f.get(r).addAssertion(e,t)},builder_updateAssertionsAt(r,e,t){f.get(r).updateAssertionsAt(e,t)},builder_addRedaction(r,e,t){f.get(r).addRedaction(e,t)},builder_filterActionsAt(r,e){f.get(r).filterActionsAt(Uint32Array.from(e))},builder_updateActionsAt(r,e){f.get(r).updateActionsAt(e)},builder_filterIngredientsAt(r,e){f.get(r).filterIngredientsAt(Uint32Array.from(e))},builder_filterActionsAndIngredientsAt(r,e,t){f.get(r).filterActionsAndIngredientsAt(Uint32Array.from(e),Uint32Array.from(t))},builder_setRemoteUrl(r,e){f.get(r).setRemoteUrl(e)},builder_setNoEmbed(r,e){f.get(r).setNoEmbed(e)},builder_updateManifestProperty(r,e,t){f.get(r).updateManifestProperty(e,t)},builder_setThumbnailFromBlob(r,e,t){f.get(r).setThumbnailFromBlob(e,t)},builder_addIngredient(r,e){f.get(r).addIngredient(e)},async builder_addIngredientFromBlob(r,e,t,n){await f.get(r).addIngredientFromBlob(e,t,n)},builder_addResourceFromBlob(r,e,t){f.get(r).addResourceFromBlob(e,t)},builder_getDefinition(r){return f.get(r).getDefinition()},builder_toArchive(r){const t=f.get(r).toArchive();return v(t,t.buffer)},async builder_sign(r,e,t,n,_,c){const i=await f.get(r).sign({reserveSize:t.reserveSize,alg:t.alg,sign:async u=>await k.sign(e,v(u,u.buffer),t.reserveSize)},q(n),_,c);return v(i,i.buffer)},async builder_signAndGetManifestBytes(r,e,t,n,_,c){const s=f.get(r),{manifest:i,asset:u}=await s.signAndGetManifestBytes({reserveSize:t.reserveSize,alg:t.alg,sign:async g=>await k.sign(e,v(g,g.buffer),t.reserveSize)},q(n),_,c);return v({manifest:i,asset:u},[i.buffer,u.buffer])},builder_free(r){f.get(r).free(),f.remove(r)}}));function ae(r){const e={};for(const[t,n]of Object.entries(r))e[t]=async(..._)=>{try{return await n(..._)}catch(c){throw typeof c=="string"?new Error(c):c}};return e}})();\n', O = typeof self < "u" && self.Blob && new Blob([q], { type: "text/javascript;charset=utf-8" });
function $(r) {
  let e;
  try {
    if (e = O && (self.URL || self.webkitURL).createObjectURL(O), !e) throw "";
    const t = new Worker(e, {
      name: r == null ? void 0 : r.name
    });
    return t.addEventListener("error", () => {
      (self.URL || self.webkitURL).revokeObjectURL(e);
    }), t;
  } catch {
    return new Worker(
      "data:text/javascript;charset=utf-8," + encodeURIComponent(q),
      {
        name: r == null ? void 0 : r.name
      }
    );
  } finally {
    e && (self.URL || self.webkitURL).revokeObjectURL(e);
  }
}
function H(r) {
  if (r.protocol !== "https:")
    throw new Error(
      `Worker source URL must use https, but got ${r.protocol}`
    );
  return r.toString();
}
async function Q(r) {
  const { wasm: e, workerSrc: t } = r;
  let i = 0;
  const _ = t ? new Worker(H(t), { type: "module" }) : new $(), o = V(_), a = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new Map();
  G(
    {
      sign: async (f, g, v) => {
        const m = a.get(f);
        if (a.delete(f), !m)
          throw new Error("No signer registered for request");
        const M = await m(g, v);
        return k(M, M.buffer);
      },
      // Reverse-RPC handler for a CAWG credential holder's `sign`, mirroring
      // `sign` above: the callback was registered on the main thread by
      // `Builder.sign`/`signAndGetManifestBytes` (see
      // `registerCredentialHolderReceiver`) and is looked up and run here,
      // never inside the worker.
      cawgSign: async (f, g) => {
        const v = u.get(f);
        if (u.delete(f), !v)
          throw new Error("No credential holder registered for request");
        const m = await v(g);
        return k(m, m.buffer);
      }
    },
    _
  );
  function d(f) {
    const g = i++;
    return a.set(g, f), g;
  }
  function w(f) {
    const g = i++;
    return u.set(g, f), g;
  }
  return await o.initWorker(e), {
    tx: o,
    registerSignReceiver: d,
    registerCredentialHolderReceiver: w,
    terminate: () => _.terminate()
  };
}
typeof FinalizationRegistry > "u" || new FinalizationRegistry((r) => x.__wbg_wasmbuilder_free(r, 1));
typeof FinalizationRegistry > "u" || new FinalizationRegistry((r) => x.__wbg_wasmreader_free(r, 1));
typeof FinalizationRegistry > "u" || new FinalizationRegistry((r) => x.__wbg_wasmsigner_free(r, 1));
typeof FinalizationRegistry > "u" || new FinalizationRegistry((r) => x.__wbindgen_destroy_closure(r.a, r.b));
let X = new TextDecoder("utf-8", { ignoreBOM: !0, fatal: !0 });
X.decode();
const B = new TextEncoder();
"encodeInto" in B || (B.encodeInto = function(r, e) {
  const t = B.encode(r);
  return e.set(t), {
    read: r.length,
    written: t.length
  };
});
let x;
const Y = "sha512-8DsR9dZv4DrsQt255lygHQqJ+hY6wsE+ah7WnQU7NBZ8yPnNj6GEgdrRRdywL7j9+EGQl+5UgtKP+XCYtO2MlQ==";
async function ie(r) {
  const { wasmSrc: e, workerSrc: t } = r, i = typeof e == "string" ? await Z(e) : e, _ = await Q({ wasm: i, workerSrc: t });
  return {
    worker: _,
    dispose: _.terminate
  };
}
async function Z(r) {
  const e = await fetch(r, { integrity: Y });
  return await WebAssembly.compileStreaming(e);
}
const E = 10 ** 9, F = new FinalizationRegistry(
  async ({ worker: r, id: e }) => {
    await r.tx.reader_free(e);
  }
);
var b, l;
const I = class I {
  constructor(e, t) {
    h(this, b);
    h(this, l);
    y(this, b, e), y(this, l, t);
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
  static async fromBlob(e, t, i, _ = new p()) {
    S(
      i.size,
      z(_.sdkConfig, E)
    );
    try {
      const o = await _.toJson(), { worker: a } = e, u = await a.tx.reader_fromBlob(t ?? "", i, o), d = new I(a, u);
      return F.register(d, { worker: a, id: u }, d), d;
    } catch (o) {
      return J(o);
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
  static async fromBlobFragment(e, t, i, _, o = new p()) {
    const a = z(
      o.sdkConfig,
      E
    );
    S(i.size, a), S(_.size, a);
    try {
      const u = await o.toJson(), { worker: d } = e, w = await d.tx.reader_fromBlobFragment(
        t,
        i,
        _,
        u
      ), f = new I(d, w);
      return F.register(f, { worker: d, id: w }, f), f;
    } catch (u) {
      return J(u);
    }
  }
  /**
   * @returns The label of the active manifest.
   */
  async activeLabel() {
    return await n(this, b).tx.reader_activeLabel(n(this, l));
  }
  /**
   * @returns The asset's full {@link ManifestStore} containing all its manifests, validation statuses, and the URI of the active manifest.
   */
  async manifestStore() {
    return await n(this, b).tx.reader_manifestStore(n(this, l));
  }
  /**
   * @returns The asset's active {@link Manifest}.
   */
  async activeManifest() {
    return await n(this, b).tx.reader_activeManifest(n(this, l));
  }
  /**
   * @returns The asset's full {@link ManifestStore}.
   *
   * @deprecated Use {@link manifestStore} instead.
   */
  async json() {
    const e = await n(this, b).tx.reader_json(n(this, l));
    return JSON.parse(e);
  }
  /**
   * @returns The asset's manifest store as crJSON.
   */
  async crJson() {
    const e = await n(this, b).tx.reader_crJson(n(this, l));
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
    return await n(this, b).tx.reader_resourceToBytes(n(this, l), e);
  }
  /**
   * Dispose of this Reader, freeing the memory it occupied and preventing further use.
   * Call this whenever the Reader is no longer needed.
   */
  async free() {
    F.unregister(this), await n(this, b).tx.reader_free(n(this, l));
  }
};
b = new WeakMap(), l = new WeakMap();
let U = I;
function J(r) {
  if (r instanceof Error && r.message === "C2pa(JumbfNotFound)")
    return null;
  throw r;
}
async function N(r) {
  const { alg: e } = r;
  return {
    reserveSize: await r.reserveSize(),
    alg: e
  };
}
async function oe(r, e) {
  return r.worker.tx.encodeSignerPayload(e);
}
function K(r, e) {
  const { credentialHolder: t, referencedAssertions: i, roles: _ } = r;
  return {
    requestId: e,
    sigType: t.sigType,
    reserveSize: t.reserveSize,
    referencedAssertions: i ?? [],
    roles: _ ?? []
  };
}
function L(r) {
  return C(r).flat();
}
function C(r) {
  return (r.assertions ?? []).filter((e) => e.label.startsWith("c2pa.actions")).map((e) => {
    const t = e.data;
    return (t == null ? void 0 : t.actions) ?? [];
  });
}
function D(r, e) {
  const t = (e == null ? void 0 : e.identityAssertions) ?? [];
  if (t.length > 1)
    throw new Error(
      "Only one identity assertion is currently supported per signing operation."
    );
  return t.map((i) => {
    const _ = r.registerCredentialHolderReceiver(
      i.credentialHolder.sign
    );
    return K(i, _);
  });
}
const R = new FinalizationRegistry(
  ({ worker: r, id: e }) => {
    r.tx.builder_free(e);
  }
);
var s, c;
const A = class A {
  constructor(e, t) {
    h(this, s);
    h(this, c);
    y(this, s, e), y(this, c, t);
  }
  /**
   * Create a {@link Builder} with a minimal manifest definition as its initial state.
   *
   * @param c2pa The `C2pa` instance (from {@link createC2pa}) to create this builder on.
   * @param context Optional `Context` configuring this builder's behavior.
   * @returns A {@link Builder} object.
   */
  static async new(e, t = new p()) {
    const i = await t.toJson(), { worker: _ } = e, o = await _.tx.builder_new(i), a = new A(_, o);
    return R.register(a, { worker: _, id: o }, a), a;
  }
  /**
   * Create a {@link Builder} from a {@link ManifestDefinition}.
   *
   * @param c2pa The `C2pa` instance (from {@link createC2pa}) to create this builder on.
   * @param definition The {@link ManifestDefinition} to be used as the builder's initial state.
   * @param context Optional `Context` configuring this builder's behavior.
   * @returns A {@link Builder} object.
   */
  static async fromDefinition(e, t, i = new p()) {
    const _ = JSON.stringify(t), o = await i.toJson(), { worker: a } = e, u = await a.tx.builder_fromJson(_, o), d = new A(a, u);
    return R.register(d, { worker: a, id: u }, d), d;
  }
  /**
   * Create a {@link Builder} from a builder archive (created from {@link Builder.toArchive}).
   *
   * @param c2pa The `C2pa` instance (from {@link createC2pa}) to create this builder on.
   * @param archive Builder archive as a blob.
   * @param context Optional `Context` configuring this builder's behavior.
   * @returns A {@link Builder} object.
   */
  static async fromArchive(e, t, i = new p()) {
    const _ = await i.toJson(), { worker: o } = e, a = await o.tx.builder_fromArchive(t, _), u = new A(o, a);
    return R.register(u, { worker: o, id: a }, u), u;
  }
  /**
   * Sets the builder "intent."
   *
   * @todo Additional documentation coming soon.
   *
   * @param intent
   */
  async setIntent(e) {
    await n(this, s).tx.builder_setIntent(n(this, c), e);
  }
  /**
   * Add an action to the manifest's actions assertion.
   *
   * @param action Object representing the action to be added.
   */
  async addAction(e) {
    await n(this, s).tx.builder_addAction(n(this, c), e);
  }
  /**
   * Add an assertion to the manifest under the given label.
   *
   * @param label The assertion label (reverse-domain format).
   * @param data The assertion data (any JSON-serializable value).
   */
  async addAssertion(e, t) {
    await n(this, s).tx.builder_addAssertion(n(this, c), e, t);
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
    const _ = ((await this.getDefinition()).assertions ?? []).filter((o) => o.label === e).map((o) => t(o.data) ?? o.data);
    await n(this, s).tx.builder_updateAssertionsAt(n(this, c), e, _);
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
    await n(this, s).tx.builder_addRedaction(n(this, c), e, t);
  }
  /**
   * Sets the remote URL for a remote manifest. The manifest is expected to be available at this location.
   *
   * @param url URL pointing to the location the remote manifest will be stored.
   */
  async setRemoteUrl(e) {
    await n(this, s).tx.builder_setRemoteUrl(n(this, c), e);
  }
  /**
   * Sets the state of the no_embed flag.
   * To skip embedding a manifest (e.g. for the remote-only case), set this to `true`.
   *
   * @param noEmbed Value to set the no_embed flag.
   */
  async setNoEmbed(e) {
    await n(this, s).tx.builder_setNoEmbed(n(this, c), e);
  }
  /**
   * Updates a (known) property in the manifest definition.
   * Rejects an unsupported property or value type,
   * or while a sign on this builder is pending.
   */
  async updateManifestProperty(e, t) {
    await n(this, s).tx.builder_updateManifestProperty(n(this, c), e, t);
  }
  /**
   * Set a thumbnail from a blob to be included in the manifest. The blob should represent the asset being signed.
   *
   * @param format Format of the thumbnail
   * @param blob Blob of the thumbnail bytes
   */
  async setThumbnailFromBlob(e, t) {
    await n(this, s).tx.builder_setThumbnailFromBlob(n(this, c), e, t);
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
    const t = await n(this, s).tx.builder_getDefinition(
      n(this, c)
    ), _ = L(t).reduce((o, a, u) => (e(a) && o.push(u), o), []);
    await n(this, s).tx.builder_filterActionsAt(n(this, c), _);
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
    const _ = ((await n(this, s).tx.builder_getDefinition(
      n(this, c)
    )).ingredients ?? []).reduce((o, a, u) => (e(a) && o.push(u), o), []);
    await n(this, s).tx.builder_filterIngredientsAt(n(this, c), _);
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
    const i = await n(this, s).tx.builder_getDefinition(
      n(this, c)
    ), o = L(i).reduce((d, w, f) => (e(w) && d.push(f), d), []), u = (i.ingredients ?? []).reduce(
      (d, w, f) => (t(w) && d.push(f), d),
      []
    );
    await n(this, s).tx.builder_filterActionsAndIngredientsAt(
      n(this, c),
      o,
      u
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
    const t = await n(this, s).tx.builder_getDefinition(
      n(this, c)
    ), _ = C(t).map((o) => e(o));
    await n(this, s).tx.builder_updateActionsAt(n(this, c), _);
  }
  /**
   * Add an ingredient to the builder from a definition only.
   *
   * @param ingredientDefinition {@link Ingredient} definition.
   */
  async addIngredient(e) {
    const t = JSON.stringify(e);
    await n(this, s).tx.builder_addIngredient(n(this, c), t);
  }
  /**
   * Add an ingredient to the builder from a definition, format, and blob.
   * Values specified in the ingredient definition will be merged with the ingredient, and these values take precendence.
   *
   * @param ingredientDefinition {@link Ingredient} definition.
   * @param format Format of the ingredient.
   * @param blob Blob of the ingredient's bytes.
   */
  async addIngredientFromBlob(e, t, i) {
    const _ = JSON.stringify(e);
    await n(this, s).tx.builder_addIngredientFromBlob(n(this, c), _, t, i);
  }
  /**
   * Add a resource to the builder's resource store with an ID and blob of the resource's bytes.
   *
   * @param resourceId ID associated with the resource being added.
   * @param blob Blob of the resource's bytes.
   */
  async addResourceFromBlob(e, t) {
    await n(this, s).tx.builder_addResourceFromBlob(n(this, c), e, t);
  }
  /**
   * Gets the current manifest definition held by the builder.
   *
   * @returns The {@link ManifestDefinition} held by the builder.
   */
  async getDefinition() {
    return await n(this, s).tx.builder_getDefinition(n(this, c));
  }
  /**
   * Save the builder into .c2pa format.
   * This "archive" can be added to as an ingredient with {@link addIngredientFromBlob}
   *
   * @returns A builder archive in application/c2pa format.
   */
  async toArchive() {
    return await n(this, s).tx.builder_toArchive(n(this, c));
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
  async sign(e, t, i, _) {
    const o = await N(e), a = n(this, s).registerSignReceiver(e.sign), u = D(
      n(this, s),
      _
    );
    return await n(this, s).tx.builder_sign(
      n(this, c),
      a,
      o,
      u,
      t,
      i
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
  async signAndGetManifestBytes(e, t, i, _) {
    const o = await N(e), a = n(this, s).registerSignReceiver(e.sign), u = D(
      n(this, s),
      _
    );
    return await n(this, s).tx.builder_signAndGetManifestBytes(
      n(this, c),
      a,
      o,
      u,
      t,
      i
    );
  }
  /**
   * Dispose of this Builder, freeing the memory it occupied and preventing further use. Call this whenever the Builder is no longer needed.
   */
  async free() {
    R.unregister(this), await n(this, s).tx.builder_free(n(this, c));
  }
};
s = new WeakMap(), c = new WeakMap();
let P = A;
export {
  P as B,
  U as R,
  ie as c,
  oe as e
};
