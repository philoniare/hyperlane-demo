export function isObject(item: any) {
    return item && typeof item === 'object' && !Array.isArray(item);
}

export function objMerge(
    a: Record<string, any>,
    b: Record<string, any>,
    max_depth = 10,
): any {
    if (max_depth === 0) {
        throw new Error('objMerge tried to go too deep');
    }
    if (isObject(a) && isObject(b)) {
        const ret: Record<string, any> = {};
        const aKeys = new Set(Object.keys(a));
        const bKeys = new Set(Object.keys(b));
        const allKeys = new Set([...aKeys, ...bKeys]);
        for (const key of allKeys.values()) {
            if (aKeys.has(key) && bKeys.has(key)) {
                ret[key] = objMerge(a[key], b[key], max_depth - 1);
            } else if (aKeys.has(key)) {
                ret[key] = a[key];
            } else {
                ret[key] = b[key];
            }
        }
        return ret;
    } else {
        return b ? b : a;
    }
}