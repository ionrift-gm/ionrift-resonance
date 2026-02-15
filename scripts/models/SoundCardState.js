export class SoundCardState {
    /**
     * @param {string} key - The configuration key (e.g. "CORE_HIT")
     * @param {string|object} value - The current value (from settings/flags)
     * @param {string|object|Array} defaultValue - The default value (from constants)
     * @param {string} label - Display label
     * @param {string} description - Tooltip description
     * @param {string} inheritanceSource - Name of parent sound if inherited (optional)
     */
    constructor(key, value, defaultValue, label, description, inheritanceSource = null) {
        this.key = key;
        this.value = value;
        this.defaultValue = defaultValue;
        this.label = label;
        this.description = description;

        // Derived State
        this.isCustom = false;
        this.isDefault = true;
        this.isInherited = false;
        this.inheritanceSource = inheritanceSource;
        this.displayTags = [];
        this.inputValue = "";

        this._parse();
    }

    _parse() {
        let effectiveValue = null;

        // 1. Determine Effective Value & Status
        if (this.value && this.value !== "") {
            this.isCustom = true;
            this.isDefault = false;
            effectiveValue = this.value;
        } else {
            effectiveValue = this.defaultValue;
            // If default value exists and we have a source, it's inherited
            if (this.inheritanceSource) {
                this.isInherited = true;
            }
        }

        // 2. Normalize to Array
        let rawList = [];
        if (Array.isArray(effectiveValue)) {
            rawList = effectiveValue;
        } else if (effectiveValue) {
            // Check for JSON String Array
            if (typeof effectiveValue === 'string') {
                const trimmed = effectiveValue.trim();
                // If it starts with [, try to parse as array
                if (trimmed.startsWith("[")) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        if (Array.isArray(parsed)) {
                            rawList = parsed;
                        } else {
                            rawList = [effectiveValue];
                        }
                    } catch (e) {
                        rawList = [effectiveValue];
                    }
                } else {
                    rawList = [effectiveValue];
                }
            } else {
                rawList = [effectiveValue];
            }
        }

        // 3. Process Tags
        this.displayTags = rawList.map(entry => {
            let label = "Unknown";
            let id = "";
            let type = "ID"; // Default type

            if (typeof entry === 'object') {
                label = entry.name || entry.id || "Sound";
                id = entry.id;
                if (entry.type) type = entry.type;
            } else if (typeof entry === 'string') {
                const trimmed = entry.trim();
                // Try parse JSON
                if (trimmed.startsWith("{")) {
                    try {
                        const obj = JSON.parse(trimmed);
                        label = obj.name || obj.id;
                        id = obj.id;
                        if (obj.type) type = obj.type;
                    } catch (e) {
                        label = trimmed;
                        id = trimmed;
                    }
                } else {
                    // Raw ID
                    label = trimmed;
                    id = trimmed;
                }
            }


            // Cleanup Label
            label = String(label).replace(/^ID:\s*/, "");

            return { label, id, type, isId: type === "ID" };
        });

        // 4. Prepare Input Value (For the hidden input)
        // Only needed if custom
        if (this.isCustom) {
            if (typeof this.value === 'object') this.inputValue = JSON.stringify(this.value);
            else this.inputValue = this.value;
        } else {
            this.inputValue = "";
        }
    }

    /**
     * Returns the object structure required by the Handlebars template.
     */
    getRenderData() {
        return {
            key: this.key,
            label: this.label,
            description: this.description,
            value: this.inputValue,
            tags: this.displayTags,
            isCustom: this.isCustom,
            isDefault: this.isDefault,
            isInherited: this.isInherited,
            inheritanceSource: this.inheritanceSource
        };
    }
}
