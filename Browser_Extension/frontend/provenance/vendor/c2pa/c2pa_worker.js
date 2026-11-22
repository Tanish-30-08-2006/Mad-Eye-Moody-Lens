var $ = (r, e) => () => (e || r((e = { exports: {} }).exports, e), e.exports);
var fe = $((ge, C) => {
  class h {
    static __wrap(e) {
      const t = Object.create(h.prototype);
      return t.__wbg_ptr = e, z.register(t, t.__wbg_ptr, t), t;
    }
    __destroy_into_raw() {
      const e = this.__wbg_ptr;
      return this.__wbg_ptr = 0, z.unregister(this), e;
    }
    free() {
      const e = this.__destroy_into_raw();
      o.__wbg_wasmbuilder_free(e, 0);
    }
    /**
     * Add an action to the manifest's `Actions` assertion.
     * @param {any} action
     */
    addAction(e) {
      const t = o.wasmbuilder_addAction(this.__wbg_ptr, e);
      if (t[1])
        throw d(t[0]);
    }
    /**
     * Add an assertion to the manifest under `label` with the given `data`.
     * @param {string} label
     * @param {any} data
     */
    addAssertion(e, t) {
      const n = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), _ = a, c = o.wasmbuilder_addAssertion(this.__wbg_ptr, n, _, t);
      if (c[1])
        throw d(c[0]);
    }
    /**
     * Add an ingredient to the manifest from a JSON ingredient definition and a [`Blob`].
     *
     * # Arguments
     * * `ingredient_json` - A JSON string representing the ingredient. This ingredient is merged with the ingredient specified in the `stream` argument, and these values take precedence.
     * * `format` - The format of the ingredient.
     * * `blob` - A [`Blob`] representing an asset which should be included as an ingredient.
     * @param {string} json
     * @param {string} format
     * @param {Blob} blob
     * @returns {Promise<void>}
     */
    addIngredientFromBlob(e, t, n) {
      const _ = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), c = a, s = b(t, o.__wbindgen_malloc, o.__wbindgen_realloc), i = a;
      return o.wasmbuilder_addIngredientFromBlob(this.__wbg_ptr, _, c, s, i, n);
    }
    /**
     * Add an ingredient to the manifest from a JSON ingredient definition without a blob
     *
     * # Arguments
     * * `ingredient_json` - A JSON string representing the ingredient.
     * @param {string} json
     */
    addIngredient(e) {
      const t = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), n = a, _ = o.wasmbuilder_addIngredient(this.__wbg_ptr, t, n);
      if (_[1])
        throw d(_[0]);
    }
    /**
     * Add a redaction for a JUMBF URI with the given reason.
     *
     * Adds the URI to the builder's redaction list and appends a `c2pa.redacted` action
     * with the reason and URI parameter, as required by the C2PA spec.
     * @param {string} uri
     * @param {any} reason
     */
    addRedaction(e, t) {
      const n = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), _ = a, c = o.wasmbuilder_addRedaction(this.__wbg_ptr, n, _, t);
      if (c[1])
        throw d(c[0]);
    }
    /**
     * Add a [`Blob`] to the manifest as a resource. The ID must match an identifier in the manifest.
     * @param {string} id
     * @param {Blob} blob
     */
    addResourceFromBlob(e, t) {
      const n = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), _ = a, c = o.wasmbuilder_addResourceFromBlob(this.__wbg_ptr, n, _, t);
      if (c[1])
        throw d(c[0]);
    }
    /**
     * Retains actions and ingredients together in one step, per
     * `Builder::filter_actions_and_ingredients`. `action_indices`/`ingredient_indices` are
     * 0-based indices into [`Self::get_definition`]'s `c2pa.actions` assertion / `ingredients`
     * array, resolved on the JS side for the same reason as [`Self::filter_actions_at`].
     *
     * `rescue_ingredient` (driven by `ingredient_indices`) is evaluated for every ingredient
     * first; any action referencing an ingredient it would rescue is force-kept regardless of
     * `keep_action`.
     * @param {Uint32Array} action_indices
     * @param {Uint32Array} ingredient_indices
     */
    filterActionsAndIngredientsAt(e, t) {
      const n = E(e, o.__wbindgen_malloc), _ = a, c = E(t, o.__wbindgen_malloc), s = a, i = o.wasmbuilder_filterActionsAndIngredientsAt(this.__wbg_ptr, n, _, c, s);
      if (i[1])
        throw d(i[0]);
    }
    /**
     * Retains only the actions at the given 0-based indices into the actions currently returned
     * by [`Self::get_definition`]'s `c2pa.actions` assertion.
     *
     * The inception action, `c2pa.created` or `c2pa.opened`, is always kept regardless of
     * `indices`, and is moved to index 0 if needed, so the manifest stays valid per the C2PA
     * spec. Sets `allActionsIncluded = false` when anything is removed.
     *
     * Indices are resolved on the JS side, rather than accepting a predicate here, because the
     * builder lives in a worker and JS callbacks can't be invoked synchronously across that
     * boundary.
     *
     * This does not touch ingredients. Call [`Self::filter_ingredients_at`] with an empty list
     * to drop all orphans afterwards if you also want to drop ingredients now orphaned by the
     * removed actions.
     * @param {Uint32Array} indices
     */
    filterActionsAt(e) {
      const t = E(e, o.__wbindgen_malloc), n = a, _ = o.wasmbuilder_filterActionsAt(this.__wbg_ptr, t, n);
      if (_[1])
        throw d(_[0]);
    }
    /**
     * Retains ingredients, rescuing an otherwise-orphaned ingredient when its 0-based index into
     * [`Self::get_definition`]'s `ingredients` array is present in `indices`. Referenced and
     * `parentOf` ingredients are always kept, per `Builder::filter_ingredients`; `indices` can
     * only rescue an orphan, never drop a referenced or lineage ingredient.
     *
     * See [`Self::filter_actions_at`] for why this takes indices rather than a predicate.
     * @param {Uint32Array} indices
     */
    filterIngredientsAt(e) {
      const t = E(e, o.__wbindgen_malloc), n = a, _ = o.wasmbuilder_filterIngredientsAt(this.__wbg_ptr, t, n);
      if (_[1])
        throw d(_[0]);
    }
    /**
     * Attempts to create a new `WasmBuilder` from a builder archive.
     * Optionally accepts a context JSON string to configure the builder.
     * @param {Blob} archive
     * @param {string | null} [context_json]
     * @returns {WasmBuilder}
     */
    static fromArchive(e, t) {
      var n = w(t) ? 0 : b(t, o.__wbindgen_malloc, o.__wbindgen_realloc), _ = a;
      const c = o.wasmbuilder_fromArchive(e, n, _);
      if (c[2])
        throw d(c[1]);
      return h.__wrap(c[0]);
    }
    /**
     * Attempts to create a new `WasmBuilder` from a JSON ManifestDefinition string.
     * Optionally accepts a context JSON string to configure the builder.
     * @param {string} json
     * @param {string | null} [context_json]
     * @returns {WasmBuilder}
     */
    static fromJson(e, t) {
      const n = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), _ = a;
      var c = w(t) ? 0 : b(t, o.__wbindgen_malloc, o.__wbindgen_realloc), s = a;
      const i = o.wasmbuilder_fromJson(n, _, c, s);
      if (i[2])
        throw d(i[1]);
      return h.__wrap(i[0]);
    }
    /**
     * Get the current manifest definition.
     * @returns {string}
     */
    getDefinition() {
      const e = o.wasmbuilder_getDefinition(this.__wbg_ptr);
      if (e[2])
        throw d(e[1]);
      return d(e[0]);
    }
    /**
     * Creates a new `WasmBuilder` with a minimal manifest definition.
     * Optionally accepts a context JSON string to configure the builder.
     * @param {string | null} [context_json]
     * @returns {WasmBuilder}
     */
    static new(e) {
      var t = w(e) ? 0 : b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), n = a;
      const _ = o.wasmbuilder_new(t, n);
      if (_[2])
        throw d(_[1]);
      return h.__wrap(_[0]);
    }
    /**
     * Sets the builder "intent."
     * @param {any} json_intent
     */
    setIntent(e) {
      const t = o.wasmbuilder_setIntent(this.__wbg_ptr, e);
      if (t[1])
        throw d(t[0]);
    }
    /**
     * Sets the state of the no_embed flag.
     * @param {boolean} no_embed
     */
    setNoEmbed(e) {
      o.wasmbuilder_setNoEmbed(this.__wbg_ptr, e);
    }
    /**
     * Sets the remote_url for a remote manifest.
     *
     * The URL must return the manifest data and is injected into the destination asset when signing.
     * For remote-only manifests, set the `no_embed` flag to `true`.
     * @param {string} url
     */
    setRemoteUrl(e) {
      const t = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), n = a;
      o.wasmbuilder_setRemoteUrl(this.__wbg_ptr, t, n);
    }
    /**
     * Sets a thumbnail from a [`Blob`] to be included in the manifest. The thumbnail should represent the asset being signed.
     * @param {string} format
     * @param {Blob} blob
     */
    setThumbnailFromBlob(e, t) {
      const n = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), _ = a, c = o.wasmbuilder_setThumbnailFromBlob(this.__wbg_ptr, n, _, t);
      if (c[1])
        throw d(c[0]);
    }
    /**
     * Sign an asset using the provided SignerDefinition, format, and source Blob.
     * Use this method to get both the manifest bytes and the bytes of the signed asset.
     *
     * See [`Self::sign`] for `identity_assertions`.
     * @param {SignerDefinition} signer_definition
     * @param {any} identity_assertions
     * @param {string} format
     * @param {Blob} source
     * @returns {Promise<any>}
     */
    signAndGetManifestBytes(e, t, n, _) {
      const c = b(n, o.__wbindgen_malloc, o.__wbindgen_realloc), s = a;
      return o.wasmbuilder_signAndGetManifestBytes(this.__wbg_ptr, e, t, c, s, _);
    }
    /**
     * Sign an asset using the provided SignerDefinition, format, and source Blob.
     *
     * `identity_assertions` is an array of `IdentityAssertionDefinition` (see
     * `wasm_identity_assertion`'s typescript_custom_section); pass an empty
     * array when no CAWG identity assertions are requested.
     * @param {SignerDefinition} signer_definition
     * @param {any} identity_assertions
     * @param {string} format
     * @param {Blob} source
     * @returns {Promise<Uint8Array>}
     */
    sign(e, t, n, _) {
      const c = b(n, o.__wbindgen_malloc, o.__wbindgen_realloc), s = a;
      return o.wasmbuilder_sign(this.__wbg_ptr, e, t, c, s, _);
    }
    /**
     * "Save" a builder to an archive.
     * @returns {Uint8Array}
     */
    toArchive() {
      const e = o.wasmbuilder_toArchive(this.__wbg_ptr);
      if (e[2])
        throw d(e[1]);
      return d(e[0]);
    }
    /**
     * Replaces the actions in the `c2pa.actions`/`c2pa.actions.v2` assertions with
     * `action_groups`, computed on the JS side (see [`Self::filter_actions_at`]).
     * `softwareAgents`/`allActionsIncluded`/`templates`/`metadata` are preserved as-is.
     *
     * A manifest can carry more than one actions assertion (the created-list and gathered-list
     * entries are distinct assertions), so `action_groups` is a list-of-lists: one entry per
     * actions assertion, in the same positional order this binding enumerates them.
     *
     * Each assertion is rewritten in place, which keeps its label, `created` flag, `kind`, and
     * position in the assertion list — mirroring `Builder::filter_actions` in c2pa-rs. A group
     * that is empty drops its assertion rather than writing an invalid empty actions array.
     * No-op if there is no actions assertion. Use `add_action` for those.
     *
     * All fallible work runs before any mutation, so a failure never leaves a partially-rewritten
     * builder. An existing but malformed actions assertion is surfaced as an error rather than
     * silently replaced.
     *
     * The groups are written back verbatim: they are not validated or reordered, and unlike
     * [`Self::filter_actions_at`] the inception action is not force-kept. A caller that drops
     * `c2pa.created`/`c2pa.opened` or moves it out of first position can produce an actions
     * array that fails validation at signing time.
     * @param {any} action_groups
     */
    updateActionsAt(e) {
      const t = o.wasmbuilder_updateActionsAt(this.__wbg_ptr, e);
      if (t[1])
        throw d(t[0]);
    }
    /**
     * Replaces the data of every assertion with an exact matching label, in positional order.
     * The label, kind, created flag, and assertion position remain unchanged.
     * @param {string} label
     * @param {any} data
     */
    updateAssertionsAt(e, t) {
      const n = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), _ = a, c = o.wasmbuilder_updateAssertionsAt(this.__wbg_ptr, n, _, t);
      if (c[1])
        throw d(c[0]);
    }
    /**
     * Updates a (known) property in the manifest definition.
     * @param {string} property
     * @param {any} value
     */
    updateManifestProperty(e, t) {
      const n = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), _ = a, c = o.wasmbuilder_updateManifestProperty(this.__wbg_ptr, n, _, t);
      if (c[1])
        throw d(c[0]);
    }
  }
  Symbol.dispose && (h.prototype[Symbol.dispose] = h.prototype.free);
  class M {
    static __wrap(e) {
      const t = Object.create(M.prototype);
      return t.__wbg_ptr = e, N.register(t, t.__wbg_ptr, t), t;
    }
    __destroy_into_raw() {
      const e = this.__wbg_ptr;
      return this.__wbg_ptr = 0, N.unregister(this), e;
    }
    free() {
      const e = this.__destroy_into_raw();
      o.__wbg_wasmreader_free(e, 0);
    }
    /**
     * Returns the label of the asset's active manifest.
     * @returns {string | undefined}
     */
    activeLabel() {
      const e = o.wasmreader_activeLabel(this.__wbg_ptr);
      let t;
      return e[0] !== 0 && (t = p(e[0], e[1]), o.__wbindgen_free(e[0], e[1] * 1, 1)), t;
    }
    /**
     * Returns the asset's active manifest.
     * @returns {any}
     */
    activeManifest() {
      const e = o.wasmreader_activeManifest(this.__wbg_ptr);
      if (e[2])
        throw d(e[1]);
      return d(e[0]);
    }
    /**
     * Returns the asset's manifest store as crJSON.
     * @returns {string}
     */
    crJson() {
      let e, t;
      try {
        const n = o.wasmreader_crJson(this.__wbg_ptr);
        return e = n[0], t = n[1], p(n[0], n[1]);
      } finally {
        o.__wbindgen_free(e, t, 1);
      }
    }
    /**
     * Attempts to create a new `WasmReader` from an asset format, a `Blob` of the bytes of the initial segment, and a fragment `Blob`.
     * Optionally accepts a context JSON string to configure the reader.
     * @param {string} format
     * @param {Blob} init
     * @param {Blob} fragment
     * @param {string | null} [context_json]
     * @returns {Promise<WasmReader>}
     */
    static fromBlobFragment(e, t, n, _) {
      const c = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), s = a;
      var i = w(_) ? 0 : b(_, o.__wbindgen_malloc, o.__wbindgen_realloc), u = a;
      return o.wasmreader_fromBlobFragment(c, s, t, n, i, u);
    }
    /**
     * Attempts to create a new `WasmReader` from an asset format and `Blob` of the asset's bytes.
     * Optionally accepts a context JSON string to configure the reader.
     * @param {string} format
     * @param {Blob} blob
     * @param {string | null} [context_json]
     * @returns {Promise<WasmReader>}
     */
    static fromBlob(e, t, n) {
      const _ = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), c = a;
      var s = w(n) ? 0 : b(n, o.__wbindgen_malloc, o.__wbindgen_realloc), i = a;
      return o.wasmreader_fromBlob(_, c, t, s, i);
    }
    /**
     * Attempts to create a new `WasmReader` from an asset format and the asset's raw bytes.
     *
     * Unlike [`WasmReader::from_blob`], this entry point does not use any browser-only Web
     * APIs (`Blob`, `FileReaderSync`). The bytes are read from an in-memory [`Cursor`], which
     * implements [`Read`] + [`Seek`], so this can be called from non-browser JavaScript
     * runtimes such as Node.js, Deno, Bun, and Cloudflare Workers (workerd).
     *
     * Optionally accepts a context JSON string to configure the reader.
     * @param {string} format
     * @param {Uint8Array} bytes
     * @param {string | null} [context_json]
     * @returns {Promise<WasmReader>}
     */
    static fromBytes(e, t, n) {
      const _ = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), c = a, s = re(t, o.__wbindgen_malloc), i = a;
      var u = w(n) ? 0 : b(n, o.__wbindgen_malloc, o.__wbindgen_realloc), g = a;
      return o.wasmreader_fromBytes(_, c, s, i, u, g);
    }
    /**
     * Returns a JSON representation of the asset's manifest store.
     * @returns {string}
     */
    json() {
      let e, t;
      try {
        const n = o.wasmreader_json(this.__wbg_ptr);
        return e = n[0], t = n[1], p(n[0], n[1]);
      } finally {
        o.__wbindgen_free(e, t, 1);
      }
    }
    /**
     * Returns the asset's manifest store.
     * @returns {any}
     */
    manifestStore() {
      const e = o.wasmreader_manifestStore(this.__wbg_ptr);
      if (e[2])
        throw d(e[1]);
      return d(e[0]);
    }
    /**
     * Accepts a URI reference to a binary object in the resource store and returns a `js_sys::Uint8Array` containing the resource's bytes.
     * @param {string} uri
     * @returns {Uint8Array}
     */
    resourceToBytes(e) {
      const t = b(e, o.__wbindgen_malloc, o.__wbindgen_realloc), n = a, _ = o.wasmreader_resourceToBytes(this.__wbg_ptr, t, n);
      if (_[2])
        throw d(_[1]);
      return d(_[0]);
    }
  }
  Symbol.dispose && (M.prototype[Symbol.dispose] = M.prototype.free);
  function H(r) {
    const e = o.encodeSignerPayload(r);
    if (e[3])
      throw d(e[2]);
    var t = A(e[0], e[1]).slice();
    return o.__wbindgen_free(e[0], e[1] * 1, 1), t;
  }
  function X() {
    return {
      __proto__: null,
      "./c2pa_bg.js": {
        __proto__: null,
        __wbg_Error_30c8987f7c2ed4e2: function(e, t) {
          return Error(p(e, t));
        },
        __wbg_Number_14af1003b8dd5ead: function(e) {
          return Number(e);
        },
        __wbg_String_8564e559799eccda: function(e, t) {
          const n = String(t), _ = b(n, o.__wbindgen_malloc, o.__wbindgen_realloc), c = a;
          m().setInt32(e + 4, c, !0), m().setInt32(e + 0, _, !0);
        },
        __wbg___wbindgen_bigint_get_as_i64_a2383202b9353e4c: function(e, t) {
          const n = t, _ = typeof n == "bigint" ? n : void 0;
          m().setBigInt64(e + 8, w(_) ? BigInt(0) : _, !0), m().setInt32(e + 0, !w(_), !0);
        },
        __wbg___wbindgen_boolean_get_5b446f51afd21013: function(e) {
          const t = e, n = typeof t == "boolean" ? t : void 0;
          return w(n) ? 16777215 : n ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_4687d8d8c2017d52: function(e, t) {
          const n = x(t), _ = b(n, o.__wbindgen_malloc, o.__wbindgen_realloc), c = a;
          m().setInt32(e + 4, c, !0), m().setInt32(e + 0, _, !0);
        },
        __wbg___wbindgen_in_92f62ee1427d9e49: function(e, t) {
          return e in t;
        },
        __wbg___wbindgen_is_bigint_b123553bed3bb382: function(e) {
          return typeof e == "bigint";
        },
        __wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(e) {
          return typeof e == "function";
        },
        __wbg___wbindgen_is_null_e343b7d08827ba72: function(e) {
          return e === null;
        },
        __wbg___wbindgen_is_object_3c45d4f2dde4e749: function(e) {
          const t = e;
          return typeof t == "object" && t !== null;
        },
        __wbg___wbindgen_is_string_90b56bc79aad6f6c: function(e) {
          return typeof e == "string";
        },
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(e) {
          return e === void 0;
        },
        __wbg___wbindgen_jsval_eq_02babf21faa37971: function(e, t) {
          return e === t;
        },
        __wbg___wbindgen_jsval_loose_eq_677f21e468d6b461: function(e, t) {
          return e == t;
        },
        __wbg___wbindgen_number_get_2e0e7dee9f701a71: function(e, t) {
          const n = t, _ = typeof n == "number" ? n : void 0;
          m().setFloat64(e + 8, w(_) ? 0 : _, !0), m().setInt32(e + 0, !w(_), !0);
        },
        __wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(e, t) {
          const n = t, _ = typeof n == "string" ? n : void 0;
          var c = w(_) ? 0 : b(_, o.__wbindgen_malloc, o.__wbindgen_realloc), s = a;
          m().setInt32(e + 4, s, !0), m().setInt32(e + 0, c, !0);
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(e, t) {
          throw new Error(p(e, t));
        },
        __wbg__wbg_cb_unref_dcc1a90847f04c41: function(e) {
          e._wbg_cb_unref();
        },
        __wbg_abort_334e7f918b7c5047: function(e, t) {
          e.abort(t);
        },
        __wbg_abort_f78b99d80248bacb: function(e) {
          e.abort();
        },
        __wbg_append_1938ed58fb5613b8: function() {
          return l(function(e, t, n, _, c) {
            e.append(p(t, n), p(_, c));
          }, arguments);
        },
        __wbg_arrayBuffer_f07be74819944ea2: function() {
          return l(function(e) {
            return e.arrayBuffer();
          }, arguments);
        },
        __wbg_byteLength_9f985b8373f1f3fe: function(e) {
          return e.byteLength;
        },
        __wbg_call_187d372bd5fdd4aa: function() {
          return l(function(e, t, n) {
            return e.call(t, n);
          }, arguments);
        },
        __wbg_call_6137034ef55c9d0f: function() {
          return l(function(e, t) {
            return e.call(t);
          }, arguments);
        },
        __wbg_clearTimeout_6b8d9a38b9263d65: function(e) {
          return clearTimeout(e);
        },
        __wbg_crypto_38df2bab126b63dc: function(e) {
          return e.crypto;
        },
        __wbg_done_b41a1d26cdb37fb6: function(e) {
          return e.done;
        },
        __wbg_entries_fb6397112b1de25f: function(e) {
          return Object.entries(e);
        },
        __wbg_error_757e9472f8410341: function(e, t) {
          let n, _;
          try {
            n = e, _ = t, console.error(p(e, t));
          } finally {
            o.__wbindgen_free(n, _, 1);
          }
        },
        __wbg_fetch_9dad4fe911207b37: function(e) {
          return fetch(e);
        },
        __wbg_fetch_efc64baf325b084d: function(e, t) {
          return e.fetch(t);
        },
        __wbg_from_296ca31f8d0f1c52: function(e) {
          return Array.from(e);
        },
        __wbg_getRandomValues_436a51d0629d84e1: function() {
          return l(function(e, t) {
            globalThis.crypto.getRandomValues(A(e, t));
          }, arguments);
        },
        __wbg_getRandomValues_a608c4436c19407a: function() {
          return l(function(e, t) {
            globalThis.crypto.getRandomValues(A(e, t));
          }, arguments);
        },
        __wbg_getRandomValues_a678b7300e8ed57f: function() {
          return l(function(e, t) {
            globalThis.crypto.getRandomValues(A(e, t));
          }, arguments);
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() {
          return l(function(e, t) {
            e.getRandomValues(t);
          }, arguments);
        },
        __wbg_getTime_f5a55efff2585d5d: function(e) {
          return e.getTime();
        },
        __wbg_get_31af05bd4842a84f: function() {
          return l(function(e, t) {
            return Reflect.get(e, t);
          }, arguments);
        },
        __wbg_get_658f6698067d9515: function() {
          return l(function(e, t) {
            return Reflect.get(e, t);
          }, arguments);
        },
        __wbg_get_6c896e0571ddae51: function(e, t) {
          return e[t >>> 0];
        },
        __wbg_get_unchecked_288889d017702237: function(e, t) {
          return e[t >>> 0];
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(e, t) {
          return e[t];
        },
        __wbg_has_5d6706e5209576c1: function() {
          return l(function(e, t) {
            return Reflect.has(e, t);
          }, arguments);
        },
        __wbg_headers_eba93595f8944c2f: function(e) {
          return e.headers;
        },
        __wbg_instanceof_ArrayBuffer_a99f175873e5d9b8: function(e) {
          let t;
          try {
            t = e instanceof ArrayBuffer;
          } catch {
            t = !1;
          }
          return t;
        },
        __wbg_instanceof_Map_b2611749102d7ba3: function(e) {
          let t;
          try {
            t = e instanceof Map;
          } catch {
            t = !1;
          }
          return t;
        },
        __wbg_instanceof_Promise_e1dc6893aa1ece28: function(e) {
          let t;
          try {
            t = e instanceof Promise;
          } catch {
            t = !1;
          }
          return t;
        },
        __wbg_instanceof_Response_b8758567269c30b2: function(e) {
          let t;
          try {
            t = e instanceof Response;
          } catch {
            t = !1;
          }
          return t;
        },
        __wbg_instanceof_Uint8Array_828cef2aaacafc31: function(e) {
          let t;
          try {
            t = e instanceof Uint8Array;
          } catch {
            t = !1;
          }
          return t;
        },
        __wbg_isArray_e15a2ff68ffdbef2: function(e) {
          return Array.isArray(e);
        },
        __wbg_isSafeInteger_717808ad6a54bd9e: function(e) {
          return Number.isSafeInteger(e);
        },
        __wbg_iterator_e3c31c892080e444: function() {
          return Symbol.iterator;
        },
        __wbg_length_7f3c00c40364105e: function(e) {
          return e.length;
        },
        __wbg_length_d4bdea10311bd9cf: function(e) {
          return e.length;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(e) {
          return e.msCrypto;
        },
        __wbg_new_0_72d020f0c63443d4: function() {
          return /* @__PURE__ */ new Date();
        },
        __wbg_new_1dbf7428bba60a42: function(e) {
          return new Uint8Array(e);
        },
        __wbg_new_227d7c05414eb861: function() {
          return new Error();
        },
        __wbg_new_28744009d011f847: function() {
          return /* @__PURE__ */ new Map();
        },
        __wbg_new_2e41357094e99294: function() {
          return l(function() {
            return new AbortController();
          }, arguments);
        },
        __wbg_new_617a8cdb8bb1130e: function() {
          return new Object();
        },
        __wbg_new_83ca405eae412a62: function() {
          return l(function() {
            return new Headers();
          }, arguments);
        },
        __wbg_new_9ffe4dece67ce9fc: function() {
          return l(function() {
            return new FileReaderSync();
          }, arguments);
        },
        __wbg_new_ee2291f50781bf1d: function() {
          return new Array();
        },
        __wbg_new_from_slice_9a868026ffa4208a: function(e, t) {
          return new Uint8Array(A(e, t));
        },
        __wbg_new_typed_b01cb72a8af741a3: function(e, t) {
          try {
            var n = { a: e, b: t }, _ = (s, i) => {
              const u = n.a;
              n.a = 0;
              try {
                return Q(u, n.b, s, i);
              } finally {
                n.a = u;
              }
            };
            return new Promise(_);
          } finally {
            n.a = 0;
          }
        },
        __wbg_new_with_length_3da0ad195f6f63ba: function(e) {
          return new Uint8Array(e >>> 0);
        },
        __wbg_new_with_str_and_init_4618dee4e950224f: function() {
          return l(function(e, t, n) {
            return new Request(p(e, t), n);
          }, arguments);
        },
        __wbg_next_33784799010f1bbe: function(e) {
          return e.next;
        },
        __wbg_next_f4aac29c42af995c: function() {
          return l(function(e) {
            return e.next();
          }, arguments);
        },
        __wbg_node_84ea875411254db1: function(e) {
          return e.node;
        },
        __wbg_now_aa4ccb83129e9e55: function() {
          return Date.now();
        },
        __wbg_process_44c7a14e11e9f69e: function(e) {
          return e.process;
        },
        __wbg_prototypesetcall_bc27214492979395: function(e, t, n) {
          Uint8Array.prototype.set.call(A(e, t), n);
        },
        __wbg_queueMicrotask_9833f9a49df95a49: function(e) {
          return e.queueMicrotask;
        },
        __wbg_queueMicrotask_a72f977e97f23c5f: function(e) {
          queueMicrotask(e);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() {
          return l(function(e, t) {
            e.randomFillSync(t);
          }, arguments);
        },
        __wbg_readAsArrayBuffer_14bc98cc9cdf7c0b: function() {
          return l(function(e, t) {
            return e.readAsArrayBuffer(t);
          }, arguments);
        },
        __wbg_require_b4edbdcf3e2a1ef0: function() {
          return l(function() {
            return C.require;
          }, arguments);
        },
        __wbg_resolve_0076e10020304ede: function(e) {
          return Promise.resolve(e);
        },
        __wbg_setTimeout_f757f00851f76c42: function(e, t) {
          return setTimeout(e, t);
        },
        __wbg_set_575d3ddb70fe831d: function(e, t, n) {
          e.set(A(t, n));
        },
        __wbg_set_6ae97e73113c4f0b: function(e, t, n) {
          return e.set(t, n);
        },
        __wbg_set_6be42768c690e380: function(e, t, n) {
          e[t] = n;
        },
        __wbg_set_bea140a88be9b277: function(e, t, n) {
          e[t >>> 0] = n;
        },
        __wbg_set_body_1fb0f1008bfc7df6: function(e, t) {
          e.body = t;
        },
        __wbg_set_cache_7507c4cc5938ccc7: function(e, t) {
          e.cache = Z[t];
        },
        __wbg_set_credentials_e0dcce31ca532b7d: function(e, t) {
          e.credentials = ee[t];
        },
        __wbg_set_headers_40ad33dcf016613f: function(e, t) {
          e.headers = t;
        },
        __wbg_set_method_dcb32343247ec427: function(e, t, n) {
          e.method = p(t, n);
        },
        __wbg_set_mode_74e772635acb96ec: function(e, t) {
          e.mode = te[t];
        },
        __wbg_set_signal_2dbd377604627f26: function(e, t) {
          e.signal = t;
        },
        __wbg_signal_e5a49a2d9c65b7f6: function(e) {
          return e.signal;
        },
        __wbg_size_8f1c0b1a1fbb3810: function(e) {
          return e.size;
        },
        __wbg_slice_afd8274aed4149c0: function() {
          return l(function(e, t, n) {
            return e.slice(t, n);
          }, arguments);
        },
        __wbg_stack_3b0d974bbf31e44f: function(e, t) {
          const n = t.stack, _ = b(n, o.__wbindgen_malloc, o.__wbindgen_realloc), c = a;
          m().setInt32(e + 4, c, !0), m().setInt32(e + 0, _, !0);
        },
        __wbg_static_accessor_GLOBAL_266715b9d96ba635: function() {
          const e = typeof global > "u" ? null : global;
          return w(e) ? 0 : R(e);
        },
        __wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179: function() {
          const e = typeof globalThis > "u" ? null : globalThis;
          return w(e) ? 0 : R(e);
        },
        __wbg_static_accessor_SELF_0b583911f537483a: function() {
          const e = typeof self > "u" ? null : self;
          return w(e) ? 0 : R(e);
        },
        __wbg_static_accessor_WINDOW_d7f903d1508cbdc4: function() {
          const e = typeof window > "u" ? null : window;
          return w(e) ? 0 : R(e);
        },
        __wbg_status_ce0a98d3c57125f3: function(e) {
          return e.status;
        },
        __wbg_stringify_52ff602c1cc4fbb6: function() {
          return l(function(e) {
            return JSON.stringify(e);
          }, arguments);
        },
        __wbg_subarray_002b94d5e13d1411: function(e, t, n) {
          return e.subarray(t >>> 0, n >>> 0);
        },
        __wbg_then_c949d5a25a4e78f8: function(e, t, n) {
          return e.then(t, n);
        },
        __wbg_then_e71170d78fcf8954: function(e, t) {
          return e.then(t);
        },
        __wbg_url_8e28edeab4cd6bed: function(e, t) {
          const n = t.url, _ = b(n, o.__wbindgen_malloc, o.__wbindgen_realloc), c = a;
          m().setInt32(e + 4, c, !0), m().setInt32(e + 0, _, !0);
        },
        __wbg_valueOf_6abcff09c8156bb6: function(e) {
          return e.valueOf();
        },
        __wbg_value_f3c585ee8f5ba40c: function(e) {
          return e.value;
        },
        __wbg_versions_276b2795b1c6a219: function(e) {
          return e.versions;
        },
        __wbg_wasmreader_new: function(e) {
          return M.__wrap(e);
        },
        __wbindgen_generic_0000000000000001: function(e, t) {
          return L(e, t, K);
        },
        __wbindgen_generic_0000000000000002: function(e, t) {
          return L(e, t, Y);
        },
        __wbindgen_generic_0000000000000003: function(e) {
          return e;
        },
        __wbindgen_generic_0000000000000004: function(e) {
          return e;
        },
        __wbindgen_generic_0000000000000005: function(e, t) {
          return A(e, t);
        },
        __wbindgen_generic_0000000000000006: function(e, t) {
          return p(e, t);
        },
        __wbindgen_generic_0000000000000007: function(e) {
          return BigInt.asUintN(64, e);
        },
        __wbindgen_generic_0000000000000008: function(e, t) {
          var n = A(e, t).slice();
          return o.__wbindgen_free(e, t * 1, 1), n;
        },
        __wbindgen_init_externref_table: function() {
          const e = o.__wbindgen_externrefs, t = e.grow(4);
          e.set(0, void 0), e.set(t + 0, void 0), e.set(t + 1, null), e.set(t + 2, !0), e.set(t + 3, !1);
        }
      }
    };
  }
  function Y(r, e) {
    o.wasm_bindgen_255200e6d97c625a___convert__closures_____invoke_______true_(r, e);
  }
  function K(r, e, t) {
    const n = o.wasm_bindgen_255200e6d97c625a___convert__closures_____invoke___wasm_bindgen_255200e6d97c625a___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_255200e6d97c625a___JsError___true_(r, e, t);
    if (n[1])
      throw d(n[0]);
  }
  function Q(r, e, t, n) {
    o.wasm_bindgen_255200e6d97c625a___convert__closures_____invoke___js_sys_bd80bcec31efc073___Function_fn_wasm_bindgen_255200e6d97c625a___JsValue_____wasm_bindgen_255200e6d97c625a___sys__Undefined___js_sys_bd80bcec31efc073___Function_fn_wasm_bindgen_255200e6d97c625a___JsValue_____wasm_bindgen_255200e6d97c625a___sys__Undefined_______true_(r, e, t, n);
  }
  const Z = ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached"], ee = ["omit", "same-origin", "include"], te = ["same-origin", "no-cors", "cors", "navigate"], z = typeof FinalizationRegistry > "u" ? { register: () => {
  }, unregister: () => {
  } } : new FinalizationRegistry((r) => o.__wbg_wasmbuilder_free(r, 1)), N = typeof FinalizationRegistry > "u" ? { register: () => {
  }, unregister: () => {
  } } : new FinalizationRegistry((r) => o.__wbg_wasmreader_free(r, 1));
  typeof FinalizationRegistry > "u" || new FinalizationRegistry((r) => o.__wbg_wasmsigner_free(r, 1));
  function R(r) {
    const e = o.__externref_table_alloc();
    return o.__wbindgen_externrefs.set(e, r), e;
  }
  const J = typeof FinalizationRegistry > "u" ? { register: () => {
  }, unregister: () => {
  } } : new FinalizationRegistry((r) => o.__wbindgen_destroy_closure(r.a, r.b));
  function x(r) {
    const e = typeof r;
    if (e == "number" || e == "boolean" || r == null)
      return `${r}`;
    if (e == "string")
      return `"${r}"`;
    if (e == "symbol") {
      const _ = r.description;
      return _ == null ? "Symbol" : `Symbol(${_})`;
    }
    if (e == "function") {
      const _ = r.name;
      return typeof _ == "string" && _.length > 0 ? `Function(${_})` : "Function";
    }
    if (Array.isArray(r)) {
      const _ = r.length;
      let c = "[";
      _ > 0 && (c += x(r[0]));
      for (let s = 1; s < _; s++)
        c += ", " + x(r[s]);
      return c += "]", c;
    }
    const t = /\[object ([^\]]+)\]/.exec(toString.call(r));
    let n;
    if (t && t.length > 1)
      n = t[1];
    else
      return toString.call(r);
    if (n == "Object")
      try {
        return "Object(" + JSON.stringify(r) + ")";
      } catch {
        return "Object";
      }
    return r instanceof Error ? `${r.name}: ${r.message}
${r.stack}` : n;
  }
  function A(r, e) {
    return r = r >>> 0, S().subarray(r / 1, r / 1 + e);
  }
  let F = null;
  function m() {
    return (F === null || F.buffer.detached === !0 || F.buffer.detached === void 0 && F.buffer !== o.memory.buffer) && (F = new DataView(o.memory.buffer)), F;
  }
  function p(r, e) {
    return oe(r >>> 0, e);
  }
  let B = null;
  function ne() {
    return (B === null || B.byteLength === 0) && (B = new Uint32Array(o.memory.buffer)), B;
  }
  let T = null;
  function S() {
    return (T === null || T.byteLength === 0) && (T = new Uint8Array(o.memory.buffer)), T;
  }
  function l(r, e) {
    try {
      return r.apply(this, e);
    } catch (t) {
      const n = R(t);
      o.__wbindgen_exn_store(n);
    }
  }
  function w(r) {
    return r == null;
  }
  function L(r, e, t) {
    const n = { a: r, b: e, cnt: 1 }, _ = (...c) => {
      n.cnt++;
      const s = n.a;
      n.a = 0;
      try {
        return t(s, n.b, ...c);
      } finally {
        n.a = s, _._wbg_cb_unref();
      }
    };
    return _._wbg_cb_unref = () => {
      --n.cnt === 0 && (o.__wbindgen_destroy_closure(n.a, n.b), n.a = 0, J.unregister(n));
    }, J.register(_, n, n), _;
  }
  function E(r, e) {
    const t = e(r.length * 4, 4) >>> 0;
    return ne().set(r, t / 4), a = r.length, t;
  }
  function re(r, e) {
    const t = e(r.length * 1, 1) >>> 0;
    return S().set(r, t / 1), a = r.length, t;
  }
  function b(r, e, t) {
    if (t === void 0) {
      const i = j.encode(r), u = e(i.length, 1) >>> 0;
      return S().subarray(u, u + i.length).set(i), a = i.length, u;
    }
    let n = r.length, _ = e(n, 1) >>> 0;
    const c = S();
    let s = 0;
    for (; s < n; s++) {
      const i = r.charCodeAt(s);
      if (i > 127) break;
      c[_ + s] = i;
    }
    if (s !== n) {
      s !== 0 && (r = r.slice(s)), _ = t(_, n, n = s + r.length * 3, 1) >>> 0;
      const i = S().subarray(_ + s, _ + n), u = j.encodeInto(r, i);
      s += u.written, _ = t(_, n, s, 1) >>> 0;
    }
    return a = s, _;
  }
  function d(r) {
    const e = o.__wbindgen_externrefs.get(r);
    return o.__externref_table_dealloc(r), e;
  }
  let O = new TextDecoder("utf-8", { ignoreBOM: !0, fatal: !0 });
  O.decode();
  const _e = 2146435072;
  let U = 0;
  function oe(r, e) {
    return U += e, U >= _e && (O = new TextDecoder("utf-8", { ignoreBOM: !0, fatal: !0 }), O.decode(), U = e), O.decode(S().subarray(r, r + e));
  }
  const j = new TextEncoder();
  "encodeInto" in j || (j.encodeInto = function(r, e) {
    const t = j.encode(r);
    return e.set(t), {
      read: r.length,
      written: t.length
    };
  });
  let a = 0, o;
  function ce(r, e) {
    return o = r.exports, F = null, B = null, T = null, o.__wbindgen_start(), o;
  }
  function se(r) {
    if (o !== void 0) return o;
    r !== void 0 && (Object.getPrototypeOf(r) === Object.prototype ? { module: r } = r : console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));
    const e = X();
    r instanceof WebAssembly.Module || (r = new WebAssembly.Module(r));
    const t = new WebAssembly.Instance(r, e);
    return ce(t);
  }
  function P() {
    let r = 0;
    const e = /* @__PURE__ */ new Map();
    return {
      add(t) {
        const n = r++;
        return e.set(n, t), n;
      },
      get(t) {
        const n = e.get(t);
        if (!n)
          throw new Error("Attempted to use an object that has been freed");
        return n;
      },
      remove(t) {
        return e.delete(t);
      }
    };
  }
  const W = Symbol("transfer");
  function I(r, e) {
    return {
      type: W,
      value: r,
      transfer: e ? Array.isArray(e) ? e : [e] : [r]
    };
  }
  function V(r) {
    return !!(r && typeof r == "object" && Reflect.get(r, "type") === W);
  }
  function q(r = "default") {
    return {
      createTx(e) {
        const t = /* @__PURE__ */ new Map(), n = e ?? self;
        return n.addEventListener("message", (_) => {
          const { data: c } = _;
          if (c.channelName !== r)
            return;
          const { id: s, result: i, error: u } = c, g = t.get(s);
          g && (u ? g.reject(u) : g.resolve(i), t.delete(s));
        }), new Proxy(
          {},
          {
            get(_, c) {
              return (...s) => {
                const i = ie(), u = [], g = [];
                return s.forEach((v) => {
                  V(v) ? (u.push(v.value), g.push(...v.transfer)) : u.push(v);
                }), n.postMessage(
                  { method: c, args: u, id: i, channelName: r },
                  { transfer: g }
                ), new Promise((v, G) => {
                  t.set(i, { resolve: v, reject: G });
                });
              };
            }
          }
        );
      },
      rx(e, t) {
        const n = t ?? self;
        n.addEventListener("message", async (_) => {
          const { data: c } = _;
          if (c.channelName !== r)
            return;
          const { method: s, args: i, id: u } = c;
          try {
            const g = await e[s](...i);
            V(g) ? n.postMessage(
              { result: g.value, id: u, channelName: r },
              { transfer: g.transfer }
            ) : n.postMessage({ result: g, id: u, channelName: r });
          } catch (g) {
            n.postMessage({ error: g, id: u, channelName: r });
          }
        });
      }
    };
  }
  function ie() {
    return new Array(4).fill(0).map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)).join("-");
  }
  const { rx: ae } = q(), { createTx: ue } = q("worker");
  function de(r) {
    if (!(r != null && r.manifests))
      return r;
    const e = r.manifests, t = Object.assign(/* @__PURE__ */ Object.create(null), e), n = Object.getPrototypeOf(e);
    return n !== null && n !== Object.prototype && (t.__proto__ = n), r.manifests = t, r;
  }
  const y = P(), f = P(), k = ue();
  function D(r) {
    return r.map((e) => ({
      sigType: e.sigType,
      reserveSize: e.reserveSize,
      referencedAssertions: e.referencedAssertions,
      roles: e.roles,
      sign: async (t) => {
        const n = t.referencedAssertions.map((c) => c.hash.buffer);
        return await k.cawgSign(e.requestId, I(t, n));
      }
    }));
  }
  ae(
    be({
      async initWorker(r) {
        se({ module: r });
      },
      encodeSignerPayload(r) {
        const e = H(r);
        return I(e, e.buffer);
      },
      async reader_fromBlob(r, e, t) {
        const n = await M.fromBlob(r, e, t);
        return y.add(n);
      },
      async reader_fromBlobFragment(r, e, t, n) {
        const _ = await M.fromBlobFragment(
          r,
          e,
          t,
          n
        );
        return y.add(_);
      },
      reader_activeLabel(r) {
        return y.get(r).activeLabel() ?? null;
      },
      reader_manifestStore(r) {
        const e = y.get(r);
        return de(e.manifestStore());
      },
      reader_activeManifest(r) {
        return y.get(r).activeManifest();
      },
      reader_json(r) {
        return y.get(r).json();
      },
      reader_crJson(r) {
        return y.get(r).crJson();
      },
      reader_resourceToBytes(r, e) {
        const n = y.get(r).resourceToBytes(e);
        return I(n, n.buffer);
      },
      reader_free(r) {
        y.get(r).free(), y.remove(r);
      },
      builder_new(r) {
        const e = h.new(r);
        return f.add(e);
      },
      builder_fromJson(r, e) {
        const t = h.fromJson(r, e);
        return f.add(t);
      },
      builder_fromArchive(r, e) {
        const t = h.fromArchive(r, e);
        return f.add(t);
      },
      builder_setIntent(r, e) {
        f.get(r).setIntent(e);
      },
      builder_addAction(r, e) {
        f.get(r).addAction(e);
      },
      builder_addAssertion(r, e, t) {
        f.get(r).addAssertion(e, t);
      },
      builder_updateAssertionsAt(r, e, t) {
        f.get(r).updateAssertionsAt(e, t);
      },
      builder_addRedaction(r, e, t) {
        f.get(r).addRedaction(e, t);
      },
      builder_filterActionsAt(r, e) {
        f.get(r).filterActionsAt(Uint32Array.from(e));
      },
      builder_updateActionsAt(r, e) {
        f.get(r).updateActionsAt(e);
      },
      builder_filterIngredientsAt(r, e) {
        f.get(r).filterIngredientsAt(Uint32Array.from(e));
      },
      builder_filterActionsAndIngredientsAt(r, e, t) {
        f.get(r).filterActionsAndIngredientsAt(
          Uint32Array.from(e),
          Uint32Array.from(t)
        );
      },
      builder_setRemoteUrl(r, e) {
        f.get(r).setRemoteUrl(e);
      },
      builder_setNoEmbed(r, e) {
        f.get(r).setNoEmbed(e);
      },
      builder_updateManifestProperty(r, e, t) {
        f.get(r).updateManifestProperty(e, t);
      },
      builder_setThumbnailFromBlob(r, e, t) {
        f.get(r).setThumbnailFromBlob(e, t);
      },
      builder_addIngredient(r, e) {
        f.get(r).addIngredient(e);
      },
      async builder_addIngredientFromBlob(r, e, t, n) {
        await f.get(r).addIngredientFromBlob(e, t, n);
      },
      builder_addResourceFromBlob(r, e, t) {
        f.get(r).addResourceFromBlob(e, t);
      },
      builder_getDefinition(r) {
        return f.get(r).getDefinition();
      },
      builder_toArchive(r) {
        const t = f.get(r).toArchive();
        return I(t, t.buffer);
      },
      async builder_sign(r, e, t, n, _, c) {
        const i = await f.get(r).sign(
          {
            reserveSize: t.reserveSize,
            alg: t.alg,
            sign: async (u) => await k.sign(
              e,
              I(u, u.buffer),
              t.reserveSize
            )
          },
          D(n),
          _,
          c
        );
        return I(i, i.buffer);
      },
      async builder_signAndGetManifestBytes(r, e, t, n, _, c) {
        const s = f.get(r), { manifest: i, asset: u } = await s.signAndGetManifestBytes(
          {
            reserveSize: t.reserveSize,
            alg: t.alg,
            sign: async (g) => await k.sign(
              e,
              I(g, g.buffer),
              t.reserveSize
            )
          },
          D(n),
          _,
          c
        );
        return I(
          {
            manifest: i,
            asset: u
          },
          [i.buffer, u.buffer]
        );
      },
      builder_free(r) {
        f.get(r).free(), f.remove(r);
      }
    })
  );
  function be(r) {
    const e = {};
    for (const [t, n] of Object.entries(r))
      e[t] = async (..._) => {
        try {
          return await n(..._);
        } catch (c) {
          throw typeof c == "string" ? new Error(c) : c;
        }
      };
    return e;
  }
});
export default fe();
