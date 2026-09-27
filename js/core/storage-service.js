/**
 * ?? IndexedDB ?脣??? (StorageService)
 * ?瑁痊嚗?隞?捆????(5MB) ??LocalStorage嚗?湔??MB ?祆?鞎∪?鞈?摮????祇蝘? * 蝺函Ⅳ嚗TF-8 with BOM
 */

class StorageService {
    constructor(dbName = 'AssetWorkbenchDB', storeName = 'app_data') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.db = null;
        this._initPromise = null;
    }

    /**
     * ?????? IndexedDB ??? (Promise)
     */
    async getDb() {
        if (this.db) return this.db;
        if (this._initPromise) return this._initPromise;

        this._initPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                return reject(new Error('?嗅??啣?銝??IndexedDB'));
            }

            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('?? IndexedDB 憭望?:', event.target.error);
                reject(event.target.error);
            };
        });

        return this._initPromise;
    }

    /**
     * 霈??潸???     * @param {string} key
     * @returns {Promise<any>}
     */
    async get(key) {
        try {
            const db = await this.getDb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const req = store.get(key);

                req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.warn(`[StorageService] 霈??${key} 憭望?嚗?閰血? LocalStorage ?:`, e);
            const fallback = localStorage.getItem(key);
            try {
                return fallback ? JSON.parse(fallback) : null;
            } catch {
                return fallback;
            }
        }
    }

    /**
     * 撖怠?萄潸???     * @param {string} key
     * @param {any} value
     * @returns {Promise<void>}
     */
    async set(key, value) {
        try {
            const db = await this.getDb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.put(value, key);

                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error(`[StorageService] 撖怠 ${key} 憭望?:`, e);
            throw e;
        }
    }

    /**
     * ?芷???萄?     * @param {string} key
     */
    async remove(key) {
        try {
            const db = await this.getDb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.delete(key);

                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error(`[StorageService] ?芷 ${key} 憭望?:`, e);
        }
    }

    /**
     * ?芸?瑼Ｘ銝血? LocalStorage ?瑞宏??鞈???IndexedDB
     */
    async migrateFromLocalStorage(key) {
        try {
            const existing = await this.get(key);
            if (!existing) {
                const localData = localStorage.getItem(key);
                if (localData) {
                    const parsed = JSON.parse(localData);
                    await this.set(key, parsed);
                    console.log(`[StorageService] ????LocalStorage ?瑞宏 ${key} ??IndexedDB`);
                }
            }
        } catch (e) {
            console.warn('[StorageService] ?瑞宏瑼Ｘ憭望?:', e);
        }
    }
}

// 撱箇??典??桐?
if (typeof window !== 'undefined') {
    window.StorageService = StorageService;
    window.appStorage = new StorageService();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageService };
}

