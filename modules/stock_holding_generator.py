import csv
import os
from datetime import datetime

class StockHoldingGenerator:
    """
    股票庫存資料產生器
    負責產生股票庫存資料並轉換為 CSV 格式
    自動計算: 未實現損益, 報酬率%
    """
    def __init__(self, stock_list_file="stock_list.txt"):
        self.stock_list_file = stock_list_file
        self.stocks = self.load_stock_list()

    def save_new_stock_to_list(self, market, code, name):
        """將新股票加入到 stock_list.txt"""
        try:
            with open(self.stock_list_file, 'a', encoding='utf-8') as f:
                f.write(f"\n{market},{code},{name}")
            print(f"✅ 已將 [{market}] {code} {name} 加入到股票清單")
            # 重新載入清單
            self.stocks = self.load_stock_list()
        except Exception as e:
            print(f"⚠️ 無法寫入股票清單: {e}")
    
    def load_stock_list(self):
        """
        從檔案讀取股票列表
        格式: 市場,代號,名稱
        """
        stocks = []
        if os.path.exists(self.stock_list_file):
            try:
                with open(self.stock_list_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        parts = line.strip().split(',')
                        if len(parts) >= 3:
                            stocks.append({
                                "市場": parts[0].strip(),
                                "代號": parts[1].strip(),
                                "名稱": parts[2].strip()
                            })
                print(f"✅ 已載入股票列表: {len(stocks)} 檔股票")
            except Exception as e:
                print(f"❌ 讀取股票列表失敗: {e}")
        else:
            print(f"⚠️ 找不到股票列表檔案: {self.stock_list_file}")
            # 建立預設檔案
            default_stocks = [
                "台股,2330,台積電",
                "台股,0050,元大台灣50",
                "複委託-美股,AAPL,Apple"
            ]
            try:
                with open(self.stock_list_file, 'w', encoding='utf-8') as f:
                    f.write('\n'.join(default_stocks))
                print(f"✅ 已建立預設股票列表檔案: {self.stock_list_file}")
            except Exception as e:
                print(f"❌ 建立股票列表檔案失敗: {e}")
                
            # 回傳預設資料以免程式無法運作
            for s in default_stocks:
                p = s.split(',')
                stocks.append({"市場": p[0], "代號": p[1], "名稱": p[2]})
                
        return stocks

    def _align_text(self, text, width):
        """
        計算文字顯示寬度並補齊空白
        中文字元算 2 寬度，英文字元算 1 寬度
        """
        display_curr = 0
        for char in text:
            if ord(char) > 127:
                display_curr += 2
            else:
                display_curr += 1
        
        padding = width - display_curr
        if padding > 0:
            return text + " " * padding
        return text

    def get_user_input(self):
        """
        互動式讀取使用者輸入
        """
        print("\n=== 📝 開始輸入股票庫存資料 ===")
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
                    if data: return data
                    return []
                
                if not date_input:
                    date_str = default_date
                    break
                
                if len(date_input) == 8 and date_input.isdigit():
                    try:
                        datetime.strptime(date_input, "%Y%m%d")
                        date_str = date_input
                        break
                    except ValueError:
                        print("❌ 日期不合法")
                else:
                    print("❌ 格式錯誤！請輸入 8 位數字")

            # 2. 選擇股票
            print("📈 可用股票:")
            for idx, s in enumerate(self.stocks, 1):
                market_aligned = self._align_text(f"[{s['市場']}]", 13) # [複委託-美股] 寬度 13
                code_aligned = self._align_text(s['代號'], 8)
                print(f"   {idx:2d}. {market_aligned} {code_aligned} {s['名稱']}")
            
            selected_stock = {}
            market = ""
            symbol = ""
            name = ""
            
            while True:
                stock_input = input("👉 請輸入股票 [編號] 或 [代號] (若為新股票請直接輸入代號): ").strip()
                if stock_input.lower() in ['q', 'exit']:
                    if data: return data
                    return []
                
                market = ""
                symbol = ""
                name = ""
                found = False
                
                # 嘗試以編號選擇
                if stock_input.isdigit():
                    idx = int(stock_input)
                    if 1 <= idx <= len(self.stocks):
                        s = self.stocks[idx-1]
                        market = s['市場']
                        symbol = s['代號']
                        name = s['名稱']
                        print(f"✅ 已選擇: [{market}] {symbol} {name}")
                        found = True
                
                # 如果不是有效編號，或者根本不是數字，嘗試以代號尋找
                if not found:
                    for s in self.stocks:
                        if s['代號'].upper() == stock_input.upper():
                            market = s['市場']
                            symbol = s['代號']
                            name = s['名稱']
                            print(f"✅ 已選擇: [{market}] {symbol} {name}")
                            found = True
                            break
                
                if found:
                    break
                
                # 股票不在清單中，詢問是否新增
                print(f"⚠️  代號 '{stock_input}' 不在清單中，將作為新股票輸入")
                symbol = stock_input
                market = input("   請輸入市場 (例如: 台股, 複委託-港股): ").strip()
                if not market:
                    print("❌ 市場不可為空")
                    continue
                    
                name = input("   請輸入股票名稱: ").strip()
                if not name:
                    print("❌ 股票名稱不可為空")
                    continue
                
                # 詢問是否要加入清單
                add_to_list = input(f"是否將 [{market}] {symbol} {name} 加入到股票清單？(y/n) [y]: ").strip().lower()
                if add_to_list != 'n':
                    self.save_new_stock_to_list(market, symbol, name)
                
                print(f"✅ 已設定: [{market}] {symbol} {name}")
                break

            # 3. 輸入持有股數
            shares = 0
            while True:
                shares_input = input(f"🔢 請輸入 [{name}] 持有股數: ").strip()
                if shares_input.lower() in ['q', 'exit']:
                    if data: return data
                    return []
                try:
                    shares = float(shares_input) # 股數可能是小數 (如美股碎股)
                    break 
                except ValueError:
                    print("❌ 股數必須為數字")

            # 4. 輸入總成本
            cost = 0
            while True:
                cost_input = input(f"💰 請輸入 [{name}] 總成本: ").strip()
                if cost_input.lower() in ['q', 'exit']:
                    if data: return data
                    return []
                try:
                    cost = int(float(cost_input)) # 成本通常記整數
                    break
                except ValueError:
                    print("❌ 金額必須為數字")
            
            # 5. 輸入總市值
            market_value = 0
            while True:
                mv_input = input(f"💎 請輸入 [{name}] 總市值 (現值): ").strip()
                if mv_input.lower() in ['q', 'exit']:
                    if data: return data
                    return []
                try:
                    market_value = int(float(mv_input)) # 市值通常記整數
                    break
                except ValueError:
                    print("❌ 金額必須為數字")

            # 6. 自動計算
            unrealized_pnl = market_value - cost
            roi = 0.0
            if cost != 0:
                roi = (unrealized_pnl / cost) * 100

            record = {
                "日期": date_str,
                "市場": market,
                "股票代號": symbol,
                "股票名稱": name,
                "持有股數": shares,
                "總成本": cost,
                "總市值": market_value,
                "未實現損益": unrealized_pnl,
                "報酬率%": round(roi, 2)
            }
            data.append(record)
            
            pnl_color = "🔴" if unrealized_pnl < 0 else "🟢"
            print(f"✅ 已暫存: {name} | 損益: {pnl_color} ${unrealized_pnl:,} ({roi:.2f}%)")

        return data

    def generate_csv(self, data, output_path):
        """
        產生股票庫存 CSV 檔案
        """
        if not data:
            print("警告: 無資料可產生 CSV")
            return
        
        # 確保輸出目錄存在
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        
        fieldnames = ["日期", "市場", "股票代號", "股票名稱", "持有股數", "總成本", "總市值", "未實現損益", "報酬率%"]
        
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
    generator = StockHoldingGenerator()
    
    today_str = datetime.now().strftime("%Y%m%d")
    output_file = os.path.join("output", f"{today_str}_stock_holdings.csv")
    
    try:
        user_data = generator.get_user_input()
        if user_data:
            print(f"\n📊 總共輸入了 {len(user_data)} 筆資料，正在存檔...")
            generator.generate_csv(user_data, output_file)
        else:
            print("\n⚠️ 未輸入任何資料，程式結束")
    except KeyboardInterrupt:
        print("\n\n⚠️ 使用者強制中斷，程式結束")
