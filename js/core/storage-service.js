/**
 * 原生 IndexedDB 儲存服務 (StorageService)
 * 職責：取代容量受限 (5MB) 的 LocalStorage，支援數十 MB 的大容量資產與交易數據持久化儲存
 * 編碼：UTF-8 with BOM
 */

class StorageService {
    constructor(dbName = 'AssetWorkbenchDB', storeName = 'app_data') {
        this.dbName = dbName;
        this.storeName = storeName;
        this.db = null;
        this._initPromise = null;
    }

    /**
     * 初始化或獲取 IndexedDB 連線 (Promise)
     */
    async getDb() {
        if (this.db) return this.db;
        if (this._initPromise) return this._initPromise;

        this._initPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                return reject(new Error('當前環境不支援 IndexedDB'));
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
                console.error('開啟 IndexedDB 失敗:', event.target.error);
                reject(event.target.error);
            };
        });

        return this._initPromise;
    }

    /**
     * 讀取指定鍵值
     * @param {string} key
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
            console.warn(`[StorageService] 讀取 ${key} 失敗，嘗試向 LocalStorage 退避:`, e);
            const fallback = localStorage.getItem(key);
            try {
                return fallback ? JSON.parse(fallback) : null;
            } catch {
                return fallback;
            }
        }
    }

    /**
     * 寫入指定鍵值
     * @param {string} key
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
            console.error(`[StorageService] 寫入 ${key} 失敗:`, e);
            throw e;
        }
    }

    /**
     * 刪除指定鍵值
     * @param {string} key
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
            console.error(`[StorageService] 刪除 ${key} 失敗:`, e);
        }
    }

    /**
     * 自動檢查並從 LocalStorage 遷移現有數據至 IndexedDB
     */
    async migrateFromLocalStorage(key) {
        try {
            const existing = await this.get(key);
            if (!existing) {
                const localData = localStorage.getItem(key);
                if (localData) {
                    const parsed = JSON.parse(localData);
                    await this.set(key, parsed);
                    console.log(`[StorageService] 成功從 LocalStorage 遷移 ${key} 至 IndexedDB`);
                }
            }
        } catch (e) {
            console.warn('[StorageService] 遷移檢查失敗:', e);
        }
    }
}

// 建立全域單例
if (typeof window !== 'undefined') {
    window.StorageService = StorageService;
    window.appStorage = new StorageService();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageService };
}
