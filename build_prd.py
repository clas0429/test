from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE

out='個人行程與任務管理系統_PRD.docx'
doc=Document()
sec=doc.sections[0]
sec.top_margin=Inches(.72); sec.bottom_margin=Inches(.72); sec.left_margin=Inches(.78); sec.right_margin=Inches(.78)
styles=doc.styles
for name in ['Normal','Title','Subtitle','Heading 1','Heading 2','Heading 3']:
    s=styles[name]; s.font.name='Aptos'; s._element.rPr.rFonts.set(qn('w:eastAsia'),'Microsoft JhengHei')
styles['Normal'].font.size=Pt(10.5); styles['Normal'].font.color.rgb=RGBColor(45,54,47); styles['Normal'].paragraph_format.space_after=Pt(6)
for name,size in [('Title',28),('Heading 1',18),('Heading 2',13),('Heading 3',11)]:
    s=styles[name]; s.font.size=Pt(size); s.font.bold=True; s.font.color.rgb=RGBColor(0,0,0); s.paragraph_format.space_before=Pt(13 if name!='Title' else 0); s.paragraph_format.space_after=Pt(6)
styles['Title'].paragraph_format.keep_with_next=True

def shade(cell,fill):
    tcPr=cell._tc.get_or_add_tcPr(); shd=OxmlElement('w:shd'); shd.set(qn('w:fill'),fill); tcPr.append(shd)
def borders(table,color='D9D9D9'):
    tblPr=table._tbl.tblPr; b=OxmlElement('w:tblBorders')
    for edge in ('top','left','bottom','right','insideH','insideV'):
        el=OxmlElement('w:'+edge); el.set(qn('w:val'),'single'); el.set(qn('w:sz'),'5'); el.set(qn('w:color'),color); b.append(el)
    tblPr.append(b)
def cell_margins(cell,top=100,start=110,bottom=100,end=110):
    tc=cell._tc; tcPr=tc.get_or_add_tcPr(); mar=OxmlElement('w:tcMar')
    for k,v in [('top',top),('start',start),('bottom',bottom),('end',end)]:
        n=OxmlElement('w:'+k); n.set(qn('w:w'),str(v)); n.set(qn('w:type'),'dxa'); mar.append(n)
    tcPr.append(mar)
def table(headers,rows,widths=None):
    t=doc.add_table(rows=1, cols=len(headers)); t.alignment=WD_TABLE_ALIGNMENT.CENTER; t.autofit=False
    if widths:
        for col,w in zip(t.columns,widths): col.width=Inches(w)
    for i,h in enumerate(headers):
        c=t.rows[0].cells[i]; c.text=h; shade(c,'315D45'); c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER; cell_margins(c,130,120,130,120)
        for p in c.paragraphs:
            for r in p.runs: r.font.bold=True; r.font.color.rgb=RGBColor(255,255,255); r.font.size=Pt(9.5)
    trPr=t.rows[0]._tr.get_or_add_trPr(); rep=OxmlElement('w:tblHeader'); rep.set(qn('w:val'),'true'); trPr.append(rep)
    for ri,row in enumerate(rows):
        cells=t.add_row().cells
        for i,val in enumerate(row):
            cells[i].text=str(val); cells[i].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER; cell_margins(cells[i])
            if ri%2: shade(cells[i],'F2F6F3')
            for p in cells[i].paragraphs:
                p.paragraph_format.space_after=Pt(2)
                for r in p.runs: r.font.size=Pt(9.3)
    borders(t); doc.add_paragraph().paragraph_format.space_after=Pt(2)
    return t
def para(text='',style=None,boldlead=None):
    p=doc.add_paragraph(style=style)
    if boldlead and text.startswith(boldlead):
        p.add_run(boldlead).bold=True; p.add_run(text[len(boldlead):])
    else: p.add_run(text)
    return p
def bullets(items):
    for x in items:
        p=doc.add_paragraph(style='List Bullet'); p.paragraph_format.space_after=Pt(3); p.add_run(x)
def h(text,level=1): doc.add_heading(text,level=level)

p=doc.add_paragraph(style='Title'); p.add_run('個人行程與任務管理系統')
p=doc.add_paragraph(); r=p.add_run('產品需求文件 PRD'); r.bold=True; r.font.size=Pt(15); r.font.color.rgb=RGBColor(61,120,88)
para('版本 1.0　|　日期 2026 年 10 月 30 日　|　狀態 初步需求基線')
para('本文件整理目前訪談已確認的需求，作為產品設計與原型驗證基礎。產品聚焦個人每日時間安排及任務追蹤，提供今日清單與週／月曆整合檢視，並以截止日、優先級和多管道提醒降低遺漏。本文尚未確認的事項會明確標註為待決，不視為既定承諾。')
h('文件資訊',1)
table(['項目','內容'],[
['產品名稱','個人行程與任務管理系統（暫名：日常 Daily）'],['目標使用者','需要管理個人每日行程並追蹤待辦事項的使用者'],['支援介面','桌機與手機；響應式 Web 為初步方向'],['文件目的','界定 MVP 範圍、功能需求、驗收條件及待決事項'],['依據','需求訪談摘要與可操作前端原型；提醒服務、帳號及技術架構尚未確認']],[1.45,5.55])
h('1. 產品背景與問題',1)
para('使用者希望在同一個工具中掌握每日行程，避免忘記待辦。單純的待辦清單無法表達時間安排；單純的行事曆則不利於管理沒有固定時段的任務。因此產品應讓任務可設定截止日，也可排入日曆並設定開始時間及預估時長，並在今日、週與月視圖中一致呈現。')
h('2. 產品目標與成功指標',1)
table(['類別','內容'],[
['主要目標','讓使用者快速看懂今日安排與未完成事項，減少遺漏。'],['核心價值','行程和任務統一管理；任務可排程；提供提醒管道與優先級。'],['成功指標（待定目標值）','任務到期提醒送達率、每週活躍使用者、任務完成率、使用者回報漏項比例。正式目標值需在基準資料與驗證方式確認後設定。']],[1.55,5.45])
h('3. 目標使用者與核心情境',1)
bullets(['個人使用者：每天查看時間軸，快速知道下一項安排。','工作／生活混合管理者：以工作、個人、家庭等分類切分任務及行程。','任務規劃者：設定截止日期、優先級，並將需要專注處理的任務排入時間軸。','提醒情境：使用者希望以系統通知、電子郵件或 LINE 接收行程與任務提醒。提醒時點與是否可同時多選尚待確認。'])
h('4. 範圍界定',1)
table(['MVP 納入','暫不納入／待決'],[
['今日總覽、時間軸、週／月曆；任務與行程建立；任務完成狀態；截止日、開始時間、預估時長；高／中／低／未設定優先級；工作／個人／家庭分類與自訂標籤；提醒偏好設定畫面；桌機與手機響應式介面。','帳號登入、多裝置資料同步、雲端儲存、重複事件、共用行事曆、邀請／協作、離線支援、第三方日曆同步、實際 Email／LINE 發送、推播佇列及重試策略、權限與資料保留政策。']],[3.45,3.55])
para('註：系統通知、Email 與 LINE 是使用者提出的提醒管道需求；實際推送需要後端、平台整合與授權，不能以目前前端原型的設定開關視為已完成。')
h('5. 功能需求',1)
table(['ID','功能','需求描述','優先級'],[
['FR-01','今日總覽','顯示選定日期的行程與排程任務時間軸；可切換前／後一天。','Must'],['FR-02','週／月曆','提供週與月視圖；日期可選取並查看當日事項；有事項的日期需可辨識。','Must'],['FR-03','新增項目','新增行程或任務，欄位至少含名稱、類型、日期、分類、開始時間、預估時長、優先級、標籤及提醒方式。','Must'],['FR-04','任務排程','任務可設定截止日期並可排入日曆，指定開始時間及預估時長；未排時段任務如何呈現待決。','Must'],['FR-05','優先級','任務可選高、中、低或不設定；清單可優先呈現未完成及高優先任務。','Must'],['FR-06','分類與標籤','提供工作、個人、家庭等預設分類，並允許建立自訂標籤。分類是否可自訂待決。','Must'],['FR-07','任務狀態','使用者可以標記任務完成／未完成；完成狀態需反映在清單、統計與日曆中。','Must'],['FR-08','提醒設定','可選系統通知、Email、LINE；可設定提醒時點／提前量。各管道的多選、預設值及失敗處理待決。','Must（設定）；通知整合待技術驗證'],['FR-09','任務清單','可查看所有任務，並按全部、未完成、已完成篩選。','Should'],['FR-10','統計','今日行程數、未完成任務數、完成率及週進度依真實資料計算。','Should'],['FR-11','響應式介面','手機可使用導覽、查看今日安排、完成任務及新增項目；桌機可同時檢視日曆與摘要。','Must']],[.55,1.15,4.55,.75])
h('6. 資料欄位與規則',1)
table(['實體','欄位／規則'],[
['行程 Event','名稱（必填）、日期（必填）、開始時間（需定義是否必填）、預估時長、分類、標籤、提醒設定。'],['任務 Task','名稱（必填）、截止日期（必填）、開始時間（排程時使用）、預估時長、優先級（高／中／低／未設定）、分類、可多個自訂標籤、完成狀態及提醒設定。'],['時間規則','需確認時區、全天項目、跨日項目、無開始時間的任務顯示方式及時間重疊提示策略。'],['刪除／編輯','目前原型主要呈現新增及完成操作。正式產品的編輯、刪除、復原與衝突處理行為需補充定義。']],[1.45,5.55])
h('7. 使用流程',1)
para('日常檢視：進入今日總覽 → 查看時間軸及未完成任務 → 勾選完成 → 點選日期或切換週／月視圖。')
para('建立排程任務：新增項目 → 選擇任務 → 輸入名稱及截止日 → 指定開始時間與預估時長 → 選擇優先級、分類、標籤和提醒 → 儲存後顯示於今日／日曆。')
para('提醒偏好：進入設定 → 開啟一種或多種提醒管道 → 設定提前時間 → 若需 Email 或 LINE，完成帳號驗證／授權（實際串接階段）。')
h('8. 非功能需求',1)
table(['面向','初步要求'],[
['易用性','主要任務操作應清晰、可被鍵盤及觸控操作；重要資訊優先呈現，狀態變更需有明確回饋。'],['相容性','支援常見桌機與手機螢幕尺寸；瀏覽器及最低版本需在技術選型後確認。'],['無障礙','顏色不可作為唯一狀態辨識方式；表單欄位需有標籤；基本鍵盤操作與語意化結構需納入驗收。'],['安全與隱私','個人行程可能包含敏感資訊；正式版需定義認證、傳輸／儲存加密、授權範圍、資料刪除及隱私政策。'],['可靠性','提醒服務需記錄發送狀態並設計失敗重試／去重；實際 SLA、備份與恢復目標待定。'],['資料持久性','原型使用頁面記憶體示範資料；正式產品必須使用持久化儲存並評估跨裝置同步。']],[1.35,5.65])
h('9. 驗收條件',1)
bullets(['在桌機及手機寬度下均可進入今日、行事曆、任務清單與設定畫面，重要操作不被遮擋。','使用者可新增一個任務，設定截止日、開始時間、預估時長、優先級、分類、自訂標籤和提醒偏好；儲存後出現在相應日期時間軸與日曆。','任務完成狀態切換後，今日待辦數、完成率及清單狀態一致更新。','週視圖與月視圖可切換；選擇日曆日期後可開啟該日安排。','可分別設定系統通知、電子郵件及 LINE 偏好；若後端尚未串接，介面需清楚標示模擬狀態，不得宣稱提醒已送達。','自訂標籤能被建立並附加至任務，重新載入後資料是否保存依正式持久化方案驗證。'])
h('10. 原型現況與限制',1)
para('目前 HTML 原型提供今日時間軸、月曆檢視、任務清單、建立項目表單、任務完成勾選與設定頁面，並使用示範資料。原型的新增及狀態變更在重新載入後不保留；提醒設定僅為前端示意，沒有推送服務；目前週／月曆互動範圍、篩選與設定持久化不代表正式版最終規格。')
h('11. 待決問題與建議',1)
table(['待決項目','建議／需確認'],[
['日期與截止日的區別','任務是否同時具有「截止日期」與「排程日期」？建議分成 dueAt 與 scheduledStart，讓任務可提前排程、截止日則代表最晚完成時間。'],['提醒策略','一筆項目可同時選多個管道嗎？各管道是否可設定不同提前量？建議支援多選並可覆寫預設值。'],['LINE 服務方案','需確認目標 LINE 通知產品、帳號授權方式及費用／政策可行性；在實作前安排 API 可行性驗證。'],['時間衝突','行程與任務時段重疊時，是否阻擋、警告或允許？建議先警告並允許使用者保留安排。'],['重複項目','是否需要每日／每週／每月重複行程與任務？建議納入 MVP 評估，因個人例行安排常見。'],['編輯、刪除、復原','需確認是否支援編輯、刪除及短暫復原；建議列入正式 MVP。'],['帳號與同步','是否需要登入與多裝置同步？若需要，這會影響資料模型、身分驗證、隱私與部署範圍。'],['平台與發佈','是否先做響應式 Web／PWA，或需要原生 iOS／Android？系統通知能力依平台而異。'],['週起始日與時區','建議由使用者設定週起始日；時間以使用者時區呈現並保存具時區資訊的時間資料。'],['目標衡量','需建立漏任務的基準與成功目標值，再決定完成率、提醒送達率等指標門檻。']],[1.55,5.45])
h('12. 風險與依賴',1)
bullets(['Email 與 LINE 發送依賴第三方服務、帳號驗證、同意授權、API 政策及可能的費用。','瀏覽器系統通知須取得使用者授權，且背景執行能力因瀏覽器、作業系統及 PWA 設定而異。','任務「截止日期」與「排程日期」若未分清，會造成清單及日曆行為混淆；應先定義資料模型。','未確認持久化與同步策略前，前端原型不能代表正式產品資料安全與跨裝置體驗。'])
h('附錄 A 原型參考',1)
para('原型檔案：index.html（位於專案工作目錄）。文件內容以目前對話確認事項為準；尚未回答之項目以待決問題列示，供後續需求訪談及版本規劃使用。')
# footer
for s in doc.sections:
    f=s.footer.paragraphs[0]; f.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    rr=f.add_run('個人行程與任務管理系統  |  PRD v1.0'); rr.font.size=Pt(8); rr.font.color.rgb=RGBColor(120,130,121)
doc.save(out)
print(out)
