import os
import sys
from datetime import datetime

# 嘗試匯入各模組
try:
    from modules.bank_asset_generator import BankAssetGenerator
    from modules.stock_holding_generator import StockHoldingGenerator
    from modules.realized_pnl_generator import RealizedPnLGenerator
except ImportError as e:
    print("❌ 匯入模組失敗，請確保 modules 資料夾存在且包含 __init__.py")
    print(f"錯誤訊息: {e}")
    sys.exit(1)

class AssetDataManager:
    def __init__(self):
        self.bank_gen = BankAssetGenerator()
        self.stock_gen = StockHoldingGenerator()
        self.pnl_gen = RealizedPnLGenerator()

    def clear_screen(self):
        os.system('cls' if os.name == 'nt' else 'clear')

    def show_menu(self):
        print("\n==================================")
        print("💰 個人資產資料管理系統")
        print("==================================")
        print("1. 🏦 輸入銀行資產資料")
        print("2. 📈 輸入股票庫存資料")
        print("3. 💸 輸入已實現損益資料")
        print("4. 🚀 一次輸入全部 (依序)")
        print("0. 🚪 離開")
        print("==================================")

    def run_bank_flow(self):
        print("\n>>> 正在啟動 [銀行資產] 模組...")
        today_str = datetime.now().strftime("%Y%m%d")
        output_file = os.path.join("output", f"{today_str}_bank_assets.csv")
        
        try:
            data = self.bank_gen.get_user_input()
            if data:
                self.bank_gen.generate_csv(data, output_file)
                input("\n按 Enter鍵 繼續...")
            else:
                print("未輸入資料。")
        except KeyboardInterrupt:
            print("\n已中斷。")

    def run_stock_flow(self):
        print("\n>>> 正在啟動 [股票庫存] 模組...")
        today_str = datetime.now().strftime("%Y%m%d")
        output_file = os.path.join("output", f"{today_str}_stock_holdings.csv")
        
        try:
            data = self.stock_gen.get_user_input()
            if data:
                self.stock_gen.generate_csv(data, output_file)
                input("\n按 Enter鍵 繼續...")
            else:
                print("未輸入資料。")
        except KeyboardInterrupt:
            print("\n已中斷。")

    def run_pnl_flow(self):
        print("\n>>> 正在啟動 [已實現損益] 模組...")
        today_str = datetime.now().strftime("%Y%m%d")
        output_file = os.path.join("output", f"{today_str}_realized_pnl.csv")
        
        try:
            data = self.pnl_gen.get_user_input()
            if data:
                self.pnl_gen.generate_csv(data, output_file)
                input("\n按 Enter鍵 繼續...")
            else:
                print("未輸入資料。")
        except KeyboardInterrupt:
            print("\n已中斷。")

    def run_all_flow(self):
        self.run_bank_flow()
        self.run_stock_flow()
        self.run_pnl_flow()
        print("\n✅ 所有模組執行完畢！")
        input("\n按 Enter鍵 回主選單...")

    def start(self):
        while True:
            self.clear_screen()
            self.show_menu()
            choice = input("👉 請選擇功能 [0-4]: ").strip()

            if choice == '1':
                self.run_bank_flow()
            elif choice == '2':
                self.run_stock_flow()
            elif choice == '3':
                self.run_pnl_flow()
            elif choice == '4':
                self.run_all_flow()
            elif choice == '0':
                print("\n👋 謝謝使用，再見！")
                break
            else:
                input("\n❌ 無效的選擇，按 Enter鍵 重試...")

if __name__ == "__main__":
    manager = AssetDataManager()
    manager.start()
