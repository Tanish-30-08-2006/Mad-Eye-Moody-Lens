/* @ts-self-types="./c2pa.d.ts" */

/**
 * Wraps a `c2pa::Builder`.
 */
export class WasmBuilder {
    static __wrap(ptr) {
        const obj = Object.create(WasmBuilder.prototype);
        obj.__wbg_ptr = ptr;
        WasmBuilderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmBuilderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmbuilder_free(ptr, 0);
    }
    /**
     * Add an action to the manifest's `Actions` assertion.
     * @param {any} action
     */
    addAction(action) {
        const ret = wasm.wasmbuilder_addAction(this.__wbg_ptr, action);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Add an assertion to the manifest under `label` with the given `data`.
     * @param {string} label
     * @param {any} data
     */
    addAssertion(label, data) {
        const ptr0 = passStringToWasm0(label, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_addAssertion(this.__wbg_ptr, ptr0, len0, data);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
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
    addIngredientFromBlob(json, format, blob) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_addIngredientFromBlob(this.__wbg_ptr, ptr0, len0, ptr1, len1, blob);
        return ret;
    }
    /**
     * Add an ingredient to the manifest from a JSON ingredient definition without a blob
     *
     * # Arguments
     * * `ingredient_json` - A JSON string representing the ingredient.
     * @param {string} json
     */
    addIngredient(json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_addIngredient(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Add a redaction for a JUMBF URI with the given reason.
     *
     * Adds the URI to the builder's redaction list and appends a `c2pa.redacted` action
     * with the reason and URI parameter, as required by the C2PA spec.
     * @param {string} uri
     * @param {any} reason
     */
    addRedaction(uri, reason) {
        const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_addRedaction(this.__wbg_ptr, ptr0, len0, reason);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Add a [`Blob`] to the manifest as a resource. The ID must match an identifier in the manifest.
     * @param {string} id
     * @param {Blob} blob
     */
    addResourceFromBlob(id, blob) {
        const ptr0 = passStringToWasm0(id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_addResourceFromBlob(this.__wbg_ptr, ptr0, len0, blob);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
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
    filterActionsAndIngredientsAt(action_indices, ingredient_indices) {
        const ptr0 = passArray32ToWasm0(action_indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(ingredient_indices, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_filterActionsAndIngredientsAt(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
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
    filterActionsAt(indices) {
        const ptr0 = passArray32ToWasm0(indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_filterActionsAt(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
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
    filterIngredientsAt(indices) {
        const ptr0 = passArray32ToWasm0(indices, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_filterIngredientsAt(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Attempts to create a new `WasmBuilder` from a builder archive.
     * Optionally accepts a context JSON string to configure the builder.
     * @param {Blob} archive
     * @param {string | null} [context_json]
     * @returns {WasmBuilder}
     */
    static fromArchive(archive, context_json) {
        var ptr0 = isLikeNone(context_json) ? 0 : passStringToWasm0(context_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_fromArchive(archive, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmBuilder.__wrap(ret[0]);
    }
    /**
     * Attempts to create a new `WasmBuilder` from a JSON ManifestDefinition string.
     * Optionally accepts a context JSON string to configure the builder.
     * @param {string} json
     * @param {string | null} [context_json]
     * @returns {WasmBuilder}
     */
    static fromJson(json, context_json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(context_json) ? 0 : passStringToWasm0(context_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_fromJson(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmBuilder.__wrap(ret[0]);
    }
    /**
     * Get the current manifest definition.
     * @returns {string}
     */
    getDefinition() {
        const ret = wasm.wasmbuilder_getDefinition(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Creates a new `WasmBuilder` with a minimal manifest definition.
     * Optionally accepts a context JSON string to configure the builder.
     * @param {string | null} [context_json]
     * @returns {WasmBuilder}
     */
    static new(context_json) {
        var ptr0 = isLikeNone(context_json) ? 0 : passStringToWasm0(context_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmBuilder.__wrap(ret[0]);
    }
    /**
     * Sets the builder "intent."
     * @param {any} json_intent
     */
    setIntent(json_intent) {
        const ret = wasm.wasmbuilder_setIntent(this.__wbg_ptr, json_intent);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Sets the state of the no_embed flag.
     * @param {boolean} no_embed
     */
    setNoEmbed(no_embed) {
        wasm.wasmbuilder_setNoEmbed(this.__wbg_ptr, no_embed);
    }
    /**
     * Sets the remote_url for a remote manifest.
     *
     * The URL must return the manifest data and is injected into the destination asset when signing.
     * For remote-only manifests, set the `no_embed` flag to `true`.
     * @param {string} url
     */
    setRemoteUrl(url) {
        const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.wasmbuilder_setRemoteUrl(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Sets a thumbnail from a [`Blob`] to be included in the manifest. The thumbnail should represent the asset being signed.
     * @param {string} format
     * @param {Blob} blob
     */
    setThumbnailFromBlob(format, blob) {
        const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_setThumbnailFromBlob(this.__wbg_ptr, ptr0, len0, blob);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
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
    signAndGetManifestBytes(signer_definition, identity_assertions, format, source) {
        const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_signAndGetManifestBytes(this.__wbg_ptr, signer_definition, identity_assertions, ptr0, len0, source);
        return ret;
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
    sign(signer_definition, identity_assertions, format, source) {
        const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_sign(this.__wbg_ptr, signer_definition, identity_assertions, ptr0, len0, source);
        return ret;
    }
    /**
     * "Save" a builder to an archive.
     * @returns {Uint8Array}
     */
    toArchive() {
        const ret = wasm.wasmbuilder_toArchive(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
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
    updateActionsAt(action_groups) {
        const ret = wasm.wasmbuilder_updateActionsAt(this.__wbg_ptr, action_groups);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Replaces the data of every assertion with an exact matching label, in positional order.
     * The label, kind, created flag, and assertion position remain unchanged.
     * @param {string} label
     * @param {any} data
     */
    updateAssertionsAt(label, data) {
        const ptr0 = passStringToWasm0(label, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_updateAssertionsAt(this.__wbg_ptr, ptr0, len0, data);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Updates a (known) property in the manifest definition.
     * @param {string} property
     * @param {any} value
     */
    updateManifestProperty(property, value) {
        const ptr0 = passStringToWasm0(property, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmbuilder_updateManifestProperty(this.__wbg_ptr, ptr0, len0, value);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WasmBuilder.prototype[Symbol.dispose] = WasmBuilder.prototype.free;

/**
 * Wraps a `c2pa::Reader`.
 */
export class WasmReader {
    static __wrap(ptr) {
        const obj = Object.create(WasmReader.prototype);
        obj.__wbg_ptr = ptr;
        WasmReaderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmReaderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmreader_free(ptr, 0);
    }
    /**
     * Returns the label of the asset's active manifest.
     * @returns {string | undefined}
     */
    activeLabel() {
        const ret = wasm.wasmreader_activeLabel(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Returns the asset's active manifest.
     * @returns {any}
     */
    activeManifest() {
        const ret = wasm.wasmreader_activeManifest(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Returns the asset's manifest store as crJSON.
     * @returns {string}
     */
    crJson() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmreader_crJson(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
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
    static fromBlobFragment(format, init, fragment, context_json) {
        const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(context_json) ? 0 : passStringToWasm0(context_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmreader_fromBlobFragment(ptr0, len0, init, fragment, ptr1, len1);
        return ret;
    }
    /**
     * Attempts to create a new `WasmReader` from an asset format and `Blob` of the asset's bytes.
     * Optionally accepts a context JSON string to configure the reader.
     * @param {string} format
     * @param {Blob} blob
     * @param {string | null} [context_json]
     * @returns {Promise<WasmReader>}
     */
    static fromBlob(format, blob, context_json) {
        const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(context_json) ? 0 : passStringToWasm0(context_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmreader_fromBlob(ptr0, len0, blob, ptr1, len1);
        return ret;
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
    static fromBytes(format, bytes, context_json) {
        const ptr0 = passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(context_json) ? 0 : passStringToWasm0(context_json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmreader_fromBytes(ptr0, len0, ptr1, len1, ptr2, len2);
        return ret;
    }
    /**
     * Returns a JSON representation of the asset's manifest store.
     * @returns {string}
     */
    json() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmreader_json(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Returns the asset's manifest store.
     * @returns {any}
     */
    manifestStore() {
        const ret = wasm.wasmreader_manifestStore(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Accepts a URI reference to a binary object in the resource store and returns a `js_sys::Uint8Array` containing the resource's bytes.
     * @param {string} uri
     * @returns {Uint8Array}
     */
    resourceToBytes(uri) {
        const ptr0 = passStringToWasm0(uri, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmreader_resourceToBytes(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) WasmReader.prototype[Symbol.dispose] = WasmReader.prototype.free;

export class WasmSigner {
    static __wrap(ptr) {
        const obj = Object.create(WasmSigner.prototype);
        obj.__wbg_ptr = ptr;
        WasmSignerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSignerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmsigner_free(ptr, 0);
    }
    /**
     * Attempt to create a new [`WasmSigner`] from a SignerDefinition.
     * @param {SignerDefinition} def
     * @returns {WasmSigner}
     */
    static fromDefinition(def) {
        const ret = wasm.wasmsigner_fromDefinition(def);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmSigner.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WasmSigner.prototype[Symbol.dispose] = WasmSigner.prototype.free;

/**
 * Encode a camelCase JavaScript SignerPayload as canonical CAWG CBOR.
 * @param {SignerPayloadInput} payload
 * @returns {Uint8Array}
 */
export function encodeSignerPayload(payload) {
    const ret = wasm.encodeSignerPayload(payload);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * Called when the WASM binary is initialized.
 */
export function run() {
    wasm.run();
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Number_14af1003b8dd5ead: function(arg0) {
            const ret = Number(arg0);
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_a2383202b9353e4c: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_5b446f51afd21013: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_4687d8d8c2017d52: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_92f62ee1427d9e49: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_b123553bed3bb382: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_e343b7d08827ba72: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_object_3c45d4f2dde4e749: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_90b56bc79aad6f6c: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_02babf21faa37971: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_677f21e468d6b461: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_dcc1a90847f04c41: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_abort_334e7f918b7c5047: function(arg0, arg1) {
            arg0.abort(arg1);
        },
        __wbg_abort_f78b99d80248bacb: function(arg0) {
            arg0.abort();
        },
        __wbg_append_1938ed58fb5613b8: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_arrayBuffer_f07be74819944ea2: function() { return handleError(function (arg0) {
            const ret = arg0.arrayBuffer();
            return ret;
        }, arguments); },
        __wbg_byteLength_9f985b8373f1f3fe: function(arg0) {
            const ret = arg0.byteLength;
            return ret;
        },
        __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_6137034ef55c9d0f: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_clearTimeout_6b8d9a38b9263d65: function(arg0) {
            const ret = clearTimeout(arg0);
            return ret;
        },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_done_b41a1d26cdb37fb6: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_entries_fb6397112b1de25f: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_fetch_9dad4fe911207b37: function(arg0) {
            const ret = fetch(arg0);
            return ret;
        },
        __wbg_fetch_efc64baf325b084d: function(arg0, arg1) {
            const ret = arg0.fetch(arg1);
            return ret;
        },
        __wbg_from_296ca31f8d0f1c52: function(arg0) {
            const ret = Array.from(arg0);
            return ret;
        },
        __wbg_getRandomValues_436a51d0629d84e1: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_a608c4436c19407a: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_a678b7300e8ed57f: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_getTime_f5a55efff2585d5d: function(arg0) {
            const ret = arg0.getTime();
            return ret;
        },
        __wbg_get_31af05bd4842a84f: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_658f6698067d9515: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_6c896e0571ddae51: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_unchecked_288889d017702237: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_has_5d6706e5209576c1: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.has(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_headers_eba93595f8944c2f: function(arg0) {
            const ret = arg0.headers;
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_a99f175873e5d9b8: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_b2611749102d7ba3: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Promise_e1dc6893aa1ece28: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Promise;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Response_b8758567269c30b2: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_828cef2aaacafc31: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_e15a2ff68ffdbef2: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_717808ad6a54bd9e: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_e3c31c892080e444: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_7f3c00c40364105e: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_d4bdea10311bd9cf: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_0_72d020f0c63443d4: function() {
            const ret = new Date();
            return ret;
        },
        __wbg_new_1dbf7428bba60a42: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_28744009d011f847: function() {
            const ret = new Map();
            return ret;
        },
        __wbg_new_2e41357094e99294: function() { return handleError(function () {
            const ret = new AbortController();
            return ret;
        }, arguments); },
        __wbg_new_617a8cdb8bb1130e: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_83ca405eae412a62: function() { return handleError(function () {
            const ret = new Headers();
            return ret;
        }, arguments); },
        __wbg_new_9ffe4dece67ce9fc: function() { return handleError(function () {
            const ret = new FileReaderSync();
            return ret;
        }, arguments); },
        __wbg_new_ee2291f50781bf1d: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_from_slice_9a868026ffa4208a: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_b01cb72a8af741a3: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke___js_sys_1746cd361478c686___Function_fn_wasm_bindgen_cb414c02e4f83cd6___JsValue_____wasm_bindgen_cb414c02e4f83cd6___sys__Undefined___js_sys_1746cd361478c686___Function_fn_wasm_bindgen_cb414c02e4f83cd6___JsValue_____wasm_bindgen_cb414c02e4f83cd6___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_length_3da0ad195f6f63ba: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_new_with_str_and_init_4618dee4e950224f: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
            return ret;
        }, arguments); },
        __wbg_next_33784799010f1bbe: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_f4aac29c42af995c: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_now_aa4ccb83129e9e55: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_now_e7c6795a7f81e10f: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_performance_3fcf6e32a7e1ed0a: function(arg0) {
            const ret = arg0.performance;
            return ret;
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_bc27214492979395: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_queueMicrotask_9833f9a49df95a49: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_a72f977e97f23c5f: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_readAsArrayBuffer_14bc98cc9cdf7c0b: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.readAsArrayBuffer(arg1);
            return ret;
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_resolve_0076e10020304ede: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_setTimeout_f757f00851f76c42: function(arg0, arg1) {
            const ret = setTimeout(arg0, arg1);
            return ret;
        },
        __wbg_set_575d3ddb70fe831d: function(arg0, arg1, arg2) {
            arg0.set(getArrayU8FromWasm0(arg1, arg2));
        },
        __wbg_set_6ae97e73113c4f0b: function(arg0, arg1, arg2) {
            const ret = arg0.set(arg1, arg2);
            return ret;
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_bea140a88be9b277: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_body_1fb0f1008bfc7df6: function(arg0, arg1) {
            arg0.body = arg1;
        },
        __wbg_set_cache_7507c4cc5938ccc7: function(arg0, arg1) {
            arg0.cache = __wbindgen_enum_RequestCache[arg1];
        },
        __wbg_set_credentials_e0dcce31ca532b7d: function(arg0, arg1) {
            arg0.credentials = __wbindgen_enum_RequestCredentials[arg1];
        },
        __wbg_set_headers_40ad33dcf016613f: function(arg0, arg1) {
            arg0.headers = arg1;
        },
        __wbg_set_method_dcb32343247ec427: function(arg0, arg1, arg2) {
            arg0.method = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_mode_74e772635acb96ec: function(arg0, arg1) {
            arg0.mode = __wbindgen_enum_RequestMode[arg1];
        },
        __wbg_set_signal_2dbd377604627f26: function(arg0, arg1) {
            arg0.signal = arg1;
        },
        __wbg_signal_e5a49a2d9c65b7f6: function(arg0) {
            const ret = arg0.signal;
            return ret;
        },
        __wbg_size_8f1c0b1a1fbb3810: function(arg0) {
            const ret = arg0.size;
            return ret;
        },
        __wbg_slice_afd8274aed4149c0: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.slice(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_266715b9d96ba635: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_0b583911f537483a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_d7f903d1508cbdc4: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_status_ce0a98d3c57125f3: function(arg0) {
            const ret = arg0.status;
            return ret;
        },
        __wbg_stringify_52ff602c1cc4fbb6: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(arg0);
            return ret;
        }, arguments); },
        __wbg_subarray_002b94d5e13d1411: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_then_c949d5a25a4e78f8: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_e71170d78fcf8954: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_url_8e28edeab4cd6bed: function(arg0, arg1) {
            const ret = arg1.url;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_valueOf_6abcff09c8156bb6: function(arg0) {
            const ret = arg0.valueOf();
            return ret;
        },
        __wbg_value_f3c585ee8f5ba40c: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbg_wasmreader_new: function(arg0) {
            const ret = WasmReader.__wrap(arg0);
            return ret;
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 3383, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke___wasm_bindgen_cb414c02e4f83cd6___JsValue__core_d941ad8722425d2e___result__Result_____wasm_bindgen_cb414c02e4f83cd6___JsError___true_);
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 2073, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke_______true_);
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000004: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000006: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000007: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_generic_0000000000000008: function(arg0, arg1) {
            var v0 = getArrayU8FromWasm0(arg0, arg1).slice();
            wasm.__wbindgen_free(arg0, arg1 * 1, 1);
            // Cast intrinsic for `Vector(U8) -> Externref`.
            const ret = v0;
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./c2pa_bg.js": import0,
    };
}

function wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke_______true_(arg0, arg1) {
    wasm.wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke_______true_(arg0, arg1);
}

function wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke___wasm_bindgen_cb414c02e4f83cd6___JsValue__core_d941ad8722425d2e___result__Result_____wasm_bindgen_cb414c02e4f83cd6___JsError___true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke___wasm_bindgen_cb414c02e4f83cd6___JsValue__core_d941ad8722425d2e___result__Result_____wasm_bindgen_cb414c02e4f83cd6___JsError___true_(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke___js_sys_1746cd361478c686___Function_fn_wasm_bindgen_cb414c02e4f83cd6___JsValue_____wasm_bindgen_cb414c02e4f83cd6___sys__Undefined___js_sys_1746cd361478c686___Function_fn_wasm_bindgen_cb414c02e4f83cd6___JsValue_____wasm_bindgen_cb414c02e4f83cd6___sys__Undefined_______true_(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen_cb414c02e4f83cd6___convert__closures_____invoke___js_sys_1746cd361478c686___Function_fn_wasm_bindgen_cb414c02e4f83cd6___JsValue_____wasm_bindgen_cb414c02e4f83cd6___sys__Undefined___js_sys_1746cd361478c686___Function_fn_wasm_bindgen_cb414c02e4f83cd6___JsValue_____wasm_bindgen_cb414c02e4f83cd6___sys__Undefined_______true_(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_RequestCache = ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached"];


const __wbindgen_enum_RequestCredentials = ["omit", "same-origin", "include"];


const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];
const WasmBuilderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmbuilder_free(ptr, 1));
const WasmReaderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmreader_free(ptr, 1));
const WasmSignerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmsigner_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }


    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
export const WASM_SRI = "sha512-8DsR9dZv4DrsQt255lygHQqJ+hY6wsE+ah7WnQU7NBZ8yPnNj6GEgdrRRdywL7j9+EGQl+5UgtKP+XCYtO2MlQ==";