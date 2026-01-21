import csv
import os
import random
from datetime import datetime

class BankAssetGenerator:
    """
    銀行資產資料產生器
    負責產生銀行資產資料並轉換為 CSV 格式 (長格式: 日期, 帳戶名稱, 金額)
    """
    def __init__(self, account_file="account_list.txt"):
        self.account_file = account_file
        self.accounts = self.load_accounts()
    
    def load_accounts(self):
        """
        從檔案讀取帳戶列表
        """
        accounts = []
        if os.path.exists(self.account_file):
            try:
                with open(self.account_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        acc = line.strip()
                        if acc:
                            accounts.append(acc)
                print(f"✅ 已載入帳戶列表: {len(accounts)} 個帳戶")
            except Exception as e:
                print(f"❌ 讀取帳戶列表失敗: {e}")
        else:
            print(f"⚠️ 找不到帳戶列表檔案: {self.account_file}")
            print("   將使用預設帳戶列表，並建立新檔案。")
            accounts = [
                "富邦", "將來", "國泰證券交割戶", "國泰(青年子帳戶)", 
                "LINEPAY", "股票/ETF(國泰)", "保單金"
            ]
            # 自動建立檔案
            try:
                with open(self.account_file, 'w', encoding='utf-8') as f:
                    f.write('\n'.join(accounts))
                print(f"✅ 已建立預設帳戶列表檔案: {self.account_file}")
            except Exception as e:
                print(f"❌ 建立帳戶列表檔案失敗: {e}")
        return accounts
    
    def generate_mock_data(self, months=3):
        """
        自動生成測試資料
        
        Args:
            months (int): 要產生的月份數量
        """
        data = []
        now = datetime.now()
        base_year = now.year
        base_month = now.month
        
        for i in range(months):
            # 計算年月
            year = base_year
            month = base_month - i
            if month <= 0:
                year -= 1
                month += 12
            date_str = f"{year}-{month:02d}"
            
            # 為每個帳戶產生隨機金額
            for account in self.accounts:
                # 產生一個比較合理的隨機金額 (1萬到50萬之間)
                amount = random.randint(10, 500) * 1000 
                if account == "LINEPAY":
                    amount = random.randint(1, 10) * 1000
                elif account == "保單金":
                    amount = 0
                
                data.append({
                    "日期": date_str,
                    "帳戶名稱": account,
                    "金額": amount
                })
        return data

    def get_user_input(self):
        """
        互動式讀取使用者輸入
        """
        print("\n=== 📝 開始輸入銀行資產資料 ===")
        print("💡 提示: 輸入 'q' 或 'exit' 可隨時結束並產生檔案")
        
        data = []
        # 使用當前時間作為固定預設值 (YYYYMMDD)
        default_date = datetime.now().strftime("%Y%m%d")
        
        while True:
            print(f"\n--- 新增一筆資料 (預設日期: {default_date}) ---")
            
            # 1. 輸入日期 (嚴格驗證 YYYYMMDD)
            date_str = ""
            while True:
                date_input = input(f"📅 請輸入日期 (YYYYMMDD) [預設 {default_date}]: ").strip()
                if date_input.lower() in ['q', 'exit']:
                    if data:
                        return data
                    return []
                
                if not date_input:
                    date_str = default_date
                    break
                
                # 驗證日期格式
                if len(date_input) == 8 and date_input.isdigit():
                    try:
                        # 嘗試解析日期確保合法
                        datetime.strptime(date_input, "%Y%m%d")
                        date_str = date_input
                        break
                    except ValueError:
                        print("❌ 日期不合法 (例如月份或日期錯誤)，請重新輸入")
                else:
                    print("❌ 格式錯誤！請輸入 8 位數字 (YYYYMMDD)，例如 20260120")
            
            # 2. 選擇或輸入帳戶 (嚴格驗證)
            print("💳 可用帳戶:")
            for idx, acc in enumerate(self.accounts, 1):
                print(f"   {idx}. {acc}")
            
            account_name = ""
            while True:
                acc_input = input("👉 請輸入帳戶名稱 或 選單編號: ").strip()
                if acc_input.lower() in ['q', 'exit']:
                    if data:
                        return data
                    return []
                
                # 檢查是否為編號
                if acc_input.isdigit():
                    idx = int(acc_input)
                    if 1 <= idx <= len(self.accounts):
                        account_name = self.accounts[idx-1]
                        break
                    else:
                        print("❌ 無效的編號，請重新輸入")
                
                # 檢查是否為完整名稱
                elif acc_input in self.accounts:
                    account_name = acc_input
                    break
                
                else:
                    print("❌ 輸入錯誤！必須是清單中的 [編號] 或 [完整名稱]，請重新輸入")

            # 3. 輸入金額
            amt_input = input(f"💰 請輸入 [{account_name}] 的金額: ").strip()
            if amt_input.lower() in ['q', 'exit']:
                if data:
                    return data
                return []
            
            try:
                amount = int(amt_input)
            except ValueError:
                print("❌ 金額必須為數字 (整數)")
                continue

            # 4. 加入清單
            record = {
                "日期": date_str,
                "帳戶名稱": account_name,
                "金額": amount
            }
            data.append(record)
            print(f"✅ 已暫存: {date_str} | {account_name} | ${amount:,}")

        return data

    def generate_csv(self, data, output_path):
        """
        產生銀行資產 CSV 檔案
        欄位: 日期, 帳戶名稱, 金額
        """
        if not data:
            print("警告: 無資料可產生 CSV")
            return
        
        # 確保輸出目錄存在
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        
        fieldnames = ["日期", "帳戶名稱", "金額"]
        
        try:
            with open(output_path, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(data)
            print(f"✅ 成功產生檔案: {output_path}")
            print(f"   欄位: {', '.join(fieldnames)}")
            print(f"   資料筆數: {len(data)}")
        except Exception as e:
            print(f"❌ 產生檔案失敗: {e}")

if __name__ == "__main__":
    generator = BankAssetGenerator()
    
    # 使用今日日期作為檔名開頭 (YYYYMMDD)
    today_str = datetime.now().strftime("%Y%m%d")
    output_file = os.path.join("output", f"{today_str}_bank_assets.csv")
    
    # 改為互動式輸入
    try:
        user_data = generator.get_user_input()
        if user_data:
            print(f"\n📊 總共輸入了 {len(user_data)} 筆資料，正在存檔...")
            generator.generate_csv(user_data, output_file)
        else:
            print("\n⚠️ 未輸入任何資料，程式結束")
    except KeyboardInterrupt:
        print("\n\n⚠️ 使用者強制中斷，程式結束")

