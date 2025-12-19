import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Instagram,
  DollarSign,
  Trash2,
  Edit2,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Camera,
  Utensils,
  Bus,
  Info,
  Plane,
  Home,
  Languages,
  Globe,
  Wallet,
  Calendar,
  Clock,
  Sparkles,
  Loader2,
  RefreshCcw,
  Car,
  Footprints,
  Train,
  Fuel,
  CornerDownLeft,
  AlertCircle,
  CheckCircle2,
  Target,
  Split,
  Map,
  ListPlus,
  Undo2,
  ArrowRight,
  History,
  ShoppingBag,
  Eye,
  Phone,
  Dot,
} from 'lucide-react';

// --- Configuration & API ---

// 🚨 請在此處填入您的 Google API Key
// 注意：Vite 專案必須以 VITE_ 開頭的變數才能被讀取到前端
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
// 定義 localStorage 的 Key
const LOCAL_STORAGE_KEY = 'travelScheduleData_v2';

// 🎯 核心 API 呼叫的通用邏輯 (通用處理 JSON 解析和錯誤)
async function callGeminiApi(
  systemPrompt,
  userPrompt,
  responseMimeType = 'application/json'
) {
  const apiKey = GOOGLE_API_KEY;
  // 實作指數退避策略
  const maxRetries = 3;
  const initialDelay = 1000; // 1 second

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 注意：在預覽環境中，即使 apiKey 為空，系統代理也會處理請求。
    // 在本地運行時，需要檢查 apiKey 是否存在。
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              responseMimeType: responseMimeType,
            },
          }),
        }
      );

      if (!response.ok) {
        // 如果是 429 或 5xx 錯誤，嘗試重試
        if (response.status === 429 || response.status >= 500) {
          if (attempt < maxRetries - 1) {
            const delay =
              initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue; // 進行下一次重試
          }
        }
        const errorBody = await response.json();
        throw new Error(
          `API Error: ${response.status} - ${errorBody.error.message}`
        );
      }

      const result = await response.json();
      let text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;

      // 解析 JSON
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1)
        text = text.substring(firstBrace, lastBrace + 1);

      return JSON.parse(text);
    } catch (error) {
      console.error('Gemini API Call Error:', error);
      // 如果是 JSON 解析錯誤或其他客戶端錯誤，則不重試
      return null;
    }
  }
  return null; // 超過最大重試次數
}

// 🎯 1. 函式 A: 快速生成卡片摘要 (Summary)
async function fetchSummary(locationName, type) {
  const systemPrompt = `
    【系統指令】
    你是一位專門為旅遊行程生成**簡短且精確摘要**的 AI 助理。
    【核心任務】
    將使用者輸入的地點，轉化為卡片所需的**簡潔結構化數據**。
    
    【分類與顏色強制規則 (Strict Rules)】
    1. **Logistics (theme: "rose")**：僅限加油、租車、還車、寄放行李等任務。
    2. **Scouting (theme: "cyan")**：**強制**只有在地點名稱或描述中**明確包含**「卡位」、「花火」+「座標」或「🔭」時，才使用此類別。
    3. **Activity/Sight (theme: "blue")**：**所有**寺廟(如善光寺)、神社、公園、景點、體驗活動。即使該處有賣食物，只要性質是景點，必須歸類為 "activity" (blue)。
    4. **Food (theme: "orange")**：僅限專門的餐廳、咖啡廳、拉麵店。
    5. **Transport (theme: "gray")**：車站、巴士站、移動過程。
    
    【格式與行為準則】
    1. **嚴格**只輸出單一且完整的 JSON 物件。
    2. **嚴禁**輸出冗長敘事，字數必須精簡。
    3. **絕不能**生成 "details" 欄位，只需輸出 "summary" 及其上層欄位。
`;

  const userPrompt = `
    行程地點： "${locationName}"
    原始分類：${type}
    請回傳 JSON 結構：
    { 
      "desc": "簡短描述 (約10字)", "jp_name": "日文搜尋關鍵字", 
      "aiData": {
        "category": "transport"|"logistics"|"activity"|"scouting"|"hub",
        "theme": "gray"|"blue"|"orange"|"dark"|"hub"|"rose"|"cyan",
        "summary": { 
          "header": "標頭", "transport_mode": "car"|"public"|"walk"|"gas"|"return", 
          "primary_info": "地點名稱/主要資訊", 
          "secondary_info": "次要資訊", 
          "location_keyword": "地圖導航關鍵字 (地點名或經緯度)", 
          "stay_time": "停留時間", 
          "one_line_tip": "一句話攻略", 
          "photo_guide": "攝影建議",
          "tel": "景點/店家電話號碼 (若無則留空)"
        }
      }
    }
`;
  return callGeminiApi(systemPrompt, userPrompt);
}

// 🎯 2. 函式 B: 專門生成長文細節 (Details)
async function fetchDetails(locationName, type) {
  const systemPrompt = `
    【系統指令】
    你是「資深日本導遊」兼「日本花火風景攝影師」與「美食推薦家」。
    【核心任務】
    針對單一地點生成**極度詳盡**的敘事文章。
    【格式與行為準則】
    1. **嚴格**只輸出單一且完整的 JSON 物件。
    2. **絕不能**輸出 "summary" 或其他頂層欄位，只需輸出 "details" 欄位。
    3. **風格要求：** 內容必須是引人入勝的敘事文章，字數應達 150-200 字以上。
    4. **長文內容:** 請確保 content 內容充實且使用繁體中文。
  `;

  const userPrompt = `
    請針對地點： "${locationName}" (原始分類：${type})，依據你的專業知識，生成以下 JSON 內容。
    { 
      "details": { 
        "title": "標題", 
        "content": "核心介紹內文(長文)", 
        "history": "歷史故事",
        "photo_advice": "攝影建議",
        "experience_tip": "體驗建議",
        "must_buy": ["必買1"],
        "must_eat": ["必吃1"],
        "must_list": ["重點1"],
        "recommendation": "附近推薦" 
      }
    }
  `;
  return callGeminiApi(systemPrompt, userPrompt);
}

// 🎯 3. 批次處理函式 (一鍵生成所有長文)
async function autoFillAllDetails(schedule, setSchedule) {
  // 篩選出需要長文，且 aiData.details 內容為空的項目 (避免重複生成)
  const targets = schedule.filter(
    (item) =>
      (item.type === 'sight' ||
        item.type === 'food' ||
        item.type === 'scouting' ||
        item.type === 'logistics') &&
      !item.aiData?.details?.content
  );

  if (targets.length === 0) return;

  // 使用 Promise.allSettled 批次發送請求
  const results = await Promise.allSettled(
    targets.map((item) => fetchDetails(item.name, item.type))
  );

  let updatedSchedule = [...schedule];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      const originalItem = targets[index];
      const newDetails = result.value.details;

      // 僅更新 aiData 內的 details 欄位
      updatedSchedule = updatedSchedule.map((item) =>
        item.id === originalItem.id
          ? {
              ...item,
              aiData: {
                ...item.aiData,
                details: newDetails,
              },
            }
          : item
      );
    } else {
      console.warn(
        `Failed to generate details for: ${targets[index]?.name}`,
        result.reason
      );
    }
  });

  setSchedule(updatedSchedule); // 更新整個行程狀態
}

// --- 您的原始數據區塊 ---

const BG_IMAGES = {
  '08/05': 'https://duk.tw/ZNYsAT.jpg?q=150&w=2070', // Airport
  '08/06': 'https://duk.tw/iB1NMl.jpg?q=80&w=2070', // Kofu
  '08/07': 'https://duk.tw/4zEjCh.jpg?q=80&w=2070', // Fireworks
  '08/08': 'https://duk.tw/cZpqnt.jpg?q=80&w=2070', // Biwako
  '08/09': 'https://duk.tw/yAkVSE.jpg?q=80&w=2070', //
  '08/10': 'https://duk.tw/NOFkQA.jpg?q=80&w=2070', //
  '08/11': 'https://duk.tw/3VofCP.jpg?q=80&w=2070', //
  '08/12': 'https://duk.tw/XiUOfg.jpg?q=80&w=2070', //
  '08/13': 'https://duk.tw/vw0ycd.jpg?q=80&w=2070', //
  '08/14': 'https://duk.tw/EpILFt.jpg?q=80&w=2070', //
  '08/15': 'https://duk.tw/VDjZYN.jpg?q=80&w=2070', //
  '08/16': 'https://duk.tw/8qz5NJ.jpg?q=80&w=2070',
  '08/17': 'https://duk.tw/QwvIKn.jpg?q=80&w=2070',

};

const JAPANESE_PHRASES = [
  { label: '不好意思 / 請問', jp: 'すみません', romaji: 'Sumimasen' },
  { label: '謝謝', jp: 'ありがとうございます', romaji: 'Arigatou gozaimasu' },
  {
    label: '這個多少錢？',
    jp: 'これはいくらですか？',
    romaji: 'Kore wa ikura desu ka?',
  },
  { label: '請給我這個', jp: 'これをください', romaji: 'Kore o kudasai' },
  {
    label: '可以刷卡嗎？',
    jp: 'カードは使えますか？',
    romaji: 'Kado wa tsukaemasu ka?',
  },
  {
    label: '洗手間在哪裡？',
    jp: 'トイレはどこですか？',
    romaji: 'Toire wa doko desu ka?',
  },
  {
    label: '加滿 (加油站)',
    jp: '満タンでお願いします',
    romaji: 'Mantan de onegaishimasu',
  },
  { label: 'Regular (紅油)', jp: 'レギュラー', romaji: 'Regyura' },
  {
    label: '有收據嗎？',
    jp: 'レシートはありますか？',
    romaji: 'Reshito wa arimasuka?',
  },
  {
    label: '請幫我結帳',
    jp: 'お会計お願いします',
    romaji: 'Okaikei onegaishimasu',
  },
];

// 預設的行程數據 - 費用已清空
const INITIAL_SCHEDULE = [
   // --- Day 1: 2026/08/05 (啟程：紅眼航班的生存戰略) ---
{ id: 100, date: '08/05', type: 'hub', name: '起點：桃園機場 T1', timeStart: '17:25', timeEnd: '17:55', desc: '集合與航廈確認', status: 'active', expenses: [], jp_name: '桃園空港 第1ターミナル', aiData: { category: 'hub', theme: 'hub', summary: { header: '旅程序章', primary_info: '桃園國際機場 第一航廈', location_keyword: 'TPE Terminal 1', stay_time: '30m', one_line_tip: '樂桃航空位於第一航廈', tel: '+886-3-398-3728' }, details: { title: '前往夏日的日本', content: '黃昏時分，桃園機場第一航廈熙來攘往。這裡是我們這趟「山梨花火與東北祭典」壯遊的起點。樂桃航空 (Peach Aviation) 的櫃台位於第一航廈，請務必再三確認電子機票上的資訊。雖然心情是雀躍的，但此刻最重要的是冷靜的檢查：護照有效期？日文駕照譯本帶了嗎？這半小時是用來將心態從「工作模式」切換為「冒險模式」的儀式。', tour_guide_advice: '廉價航空對於行李重量非常計較（手提 7kg）。建議在掛行李前，先在旁邊的磅秤確認重量，以免在櫃檯前手忙腳亂重整行李。', must_list: ['重點：確認T1航廈', '必備：護照', '必備：駕照譯本'] } } },
{ id: 101, date: '08/05', type: 'sight', name: '後勤：報到與安檢', timeStart: '17:55', timeEnd: '20:25', desc: 'LCC 關櫃嚴格', status: 'active', expenses: [], jp_name: 'チェックイン', aiData: { category: 'logistics', theme: 'rose', summary: { primary_info: '樂桃航空 報到櫃台', location_keyword: 'Peach Check-in Counter', stay_time: '2.5hr', one_line_tip: '起飛前50分鐘嚴格關櫃', tel: '+886-2-2656-3202' }, details: { title: '與時間賽跑的通關', content: '廉價航空 (LCC) 的規則是鐵律，通常在起飛前 50 分鐘會準時關櫃，一分鐘都不會通融。因此，我們預留了充裕的時間。完成報到與安檢後，進入管制區。這是你在踏上日本國土前，最後一次品嚐台灣味或補給水的機會。利用這段時間去裝滿你的水壺，並確認隨身包包裡有原子筆（填寫表格備用，雖然現在都用 VJW）。', tour_guide_advice: '樂桃的登機門有時會安排在比較遠的位置，甚至需要搭乘接駁車。請務必在登機時間前 30 分鐘抵達登機門，不要在免稅店流連忘返。', must_list: ['注意：關櫃時間', '準備：空水壺裝水', '心態：從容不迫'] } } },
{ id: 102, date: '08/05', type: 'transport', name: '移動：桃園 ➡ 羽田', timeStart: '20:25', timeEnd: '00:45', desc: 'MM860 紅眼航班', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '夜間飛行', primary_info: '樂桃 MM860', secondary_info: '預計 00:45 抵達羽田', tel: 'N/A' }, details: { title: '三小時的空中休息', content: '飛機衝入夜空，這是一班典型的「紅眼航班」。機上沒有免費餐飲，狹窄的座位是為了節省旅費的代價。建議在登機前先吃飽，或者帶一些簡單的麵包（注意液體限制）。這三個多小時的航程，請戴上降噪耳機與眼罩，強迫自己休息。因為落地後，我們將面臨深夜抵達的體力挑戰。', tour_guide_advice: '利用機上時間，將手機的 SIM 卡換好，並再次確認 Visit Japan Web (VJW) 的 QR Code 是否已截圖保存在手機相簿中，這能讓你下機後贏在起跑點。', must_list: ['必備：頸枕/眼罩', '重點：換SIM卡', '重點：VJW截圖'] } } },
{ id: 103, date: '08/05', type: 'sight', name: '後勤：羽田入境', timeStart: '00:45', timeEnd: '01:30', desc: 'VJW 快速通關', status: 'active', expenses: [], jp_name: '羽田空港 入国審査', aiData: { category: 'logistics', theme: 'rose', summary: { primary_info: '羽田機場 第三航廈', location_keyword: 'Haneda T3 Immigration', stay_time: '45m', one_line_tip: '目標 01:30 前進入大廳', tel: '+81-3-5757-8111' }, details: { title: '深夜的羽田衝刺', content: '凌晨 00:45 落地。雖然深夜航班較少，但移民官的櫃檯也開得少。下機後，請不要猶豫，跟隨黃色的「Arrival」指標快步前進。此時你的手機應該已經連上網路，打開你的 VJW 藍色畫面（檢疫）與黃色畫面（入境審查）。我們的目標是在 45 分鐘內完成通關、領取行李並進入入境大廳。', tour_guide_advice: '如果遇到團體旅客，請靈活尋找較短的排隊動線。領到行李後，別忘了在海關申報機台掃描護照與 QR Code，這比人工通道快很多。', must_list: ['準備：VJW畫面', '行動：快步前進', '目標：速戰速決'] } } },
{ id: 104, date: '08/05', type: 'hub', name: 'HUB：深夜交通決策', timeStart: '01:30', timeEnd: '02:00', desc: '溫泉 vs 休息', status: 'active', expenses: [], jp_name: '羽田空港 第3ターミナル', aiData: { category: 'hub', theme: 'hub', summary: { header: '深夜生存戰略', primary_info: '羽田機場 T3 入境大廳', location_keyword: 'Haneda Midnight Survival', stay_time: '30m', one_line_tip: '電車已收班，需做決策', tel: '+81-3-6459-9770' }, details: { title: '電車收班後的選擇題', content: '歡迎來到凌晨 1:30 的東京。此時京急線與單軌電車早已收班。站在空蕩蕩的入境大廳，我們面臨幾個選擇。\n\n1. **泉天空之湯**：與航廈直結的 24 小時溫泉。雖然半夜有加成費用，但能泡個熱水澡並在躺椅區休息，是恢復體力的首選。\n2. **機場長椅**：T3 的 2 樓與 3 樓有不少長椅，這是最省錢但最累的方案（適合年輕人）。\n3. **深夜巴士**：前往新宿或池袋的巴士班次極少且需確認是否有位。\n\n考慮到明天要早起去新宿搭車，保持體力是關鍵。', tour_guide_advice: '如果預算允許，直接入住與 T3 直結的 **Villa Fontaine Grand** 飯店是最完美的選擇，能夠在床上好好睡這寶貴的 3 小時。', must_list: ['推薦：泉天空之湯', '奢華：Villa Fontaine', '備案：機場長椅'] } } },
{ id: 105, date: '08/05', type: 'sight', name: '住宿：羽田機場', timeStart: '02:00', timeEnd: '05:00', desc: '短暫休息', status: 'active', expenses: [], jp_name: '羽田空港', aiData: { category: 'hub', theme: 'hub', summary: { primary_info: '羽田機場周邊 / 休息區', location_keyword: 'Haneda Airport Stay', stay_time: '3hr', one_line_tip: '設定 05:00 鬧鐘', tel: 'N/A' }, details: { title: '黎明前的養精蓄銳', content: '無論你選擇了溫泉躺椅、飯店軟床還是機場長椅，現在請放下手機，戴上眼罩，強迫自己入睡。明天一早 05:26 我們就要搭乘首班電車前往新宿。這短短的 3 小時睡眠，將決定你明天在富士山下的精神狀態。晚安，東京。', must_list: ['重點：設定鬧鐘', '重點：手機充電', '心態：能睡就睡'] } } },



   
    
    // --- Day 2: 2026/08/06 (新宿出發 -> 山梨自駕 -> 花火場勘) ---
{ id: 200, date: '08/06', type: 'hub', name: '起點：羽田機場 T3', timeStart: '05:00', timeEnd: '05:26', desc: '5:26 京急機場線到大門站轉大江戶線去新宿 ', status: 'active', expenses: [], jp_name: '羽田空港第3ターミナル', aiData: { category: 'hub', theme: 'hub', summary: { header: '起點', primary_info: '起點：羽田機場 T3', location_keyword: 'Haneda Airport T3', stay_time: '26m', one_line_tip: '西瓜卡餘額確認，直奔京急線' }, details: { title: '旅程起點', content: '早晨的羽田機場較為冷清，確保 Suica/Pasmo 餘額充足後，跟隨指標直接前往京急線月台，準備搭乘首班車前往市區。建議先在機場超商買瓶水，開啟這趟特種兵之旅。' } } },
{ id: 201, date: '08/06', type: 'transport', name: '移動：羽田 T3 ➡ 新宿', timeStart: '05:26', timeEnd: '06:12', desc: '京急線轉大江戶線', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：46m', transport_mode: 'train', primary_info: '京急空港線快特', secondary_info: '大門站轉乘大江戶線' }, details: { title: '早朝移動', content: '搭乘京急空港線快特 (直通都營淺草線)，於「大門站」轉乘都營大江戶線前往新宿。這是一條避開早晨山手線擁擠的聰明路線。' } } },
{ id: 202, date: '08/06', type: 'hub', name: '新宿站 (大江戶線)', timeStart: '06:12', timeEnd: '06:30', desc: '站內移動', status: 'active', expenses: [], jp_name: '新宿駅', aiData: { category: 'hub', theme: 'hub', summary: { header: '站內導航', primary_info: '新宿站 (大江戶線)', location_keyword: 'Shinjuku Station Oedo Line', stay_time: '18m', one_line_tip: '目標：尋找「新南改札」方向' }, details: { title: '新宿迷宮攻略', content: '大江戶線新宿站位於地下深處 (淺紫色系)。下車後請抬頭尋找黃色出口指標，目標是「新南改札」方向，這是前往 BUSTA 新宿最近的路徑。' } } },
{ id: 203, date: '08/06', type: 'transport', name: '移動：站內 ➡ BUSTA', timeStart: '06:30', timeEnd: '06:45', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '搭乘直達電梯至 4F', secondary_info: '直結 BUSTA 新宿' }, details: { title: '轉乘邏輯', content: '從地下月台搭乘直達電梯或手扶梯，直接前往 4F 的「高速巴士總站 (Busta Shinjuku)」。' } } },
{ id: 204, date: '08/06', type: 'hub', name: 'BUSTA 新宿 4F', timeStart: '06:45', timeEnd: '07:05', desc: '巴士候車', status: 'active', expenses: [], jp_name: 'バスタ新宿', aiData: { category: 'hub', theme: 'hub', summary: { header: '待機', primary_info: 'BUSTA 新宿 4F', location_keyword: 'Busta Shinjuku', stay_time: '20m', one_line_tip: '建議在同層全家買早餐' }, details: { title: '出發前的準備', content: '這裡有全家便利商店，建議買好早餐與飲料。接下來的巴士車程約 2 小時，車上允許飲食。請確認電子車票或 QR Code 已準備好。' } } },
{ id: 205, date: '08/06', type: 'transport', name: '移動：新宿 ➡ 甲府', timeStart: '07:05', timeEnd: '09:15', desc: '京王巴士 1501便', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：2hr 10m', transport_mode: 'bus', primary_info: '高速巴士 (京王)', secondary_info: '建議選左側座位 (看富士山)' }, details: { title: '前往山梨', content: '搭乘京王巴士 1501 便前往甲府。行駛於中央自動車道，若天氣晴朗，建議選擇「左側座位」，沿途可以欣賞到壯麗的富士山景色。' } } },
{ id: 206, date: '08/06', type: 'sight', name: '租車：ORIX 甲府站前', timeStart: '09:15', timeEnd: '09:50', desc: '租車手續', status: 'active', expenses: [], jp_name: 'オリックスレンタカー甲府駅前', aiData: { category: 'logistics', theme: 'rose', summary: { header: '自駕開始', primary_info: 'ORIX 租車 甲府站前', location_keyword: 'Orix Rent-A-Car Kofu', stay_time: '35m', one_line_tip: '檢查車身刮痕並拍照存證', tel: '055-233-0543' }, details: { title: '自駕模式啟動', content: '辦理取車手續。務必檢查車身既有的刮痕並拍照留底。設定導航至第一個目的地，調整後照鏡與座椅，準備開始山梨的自駕冒險。', must_list: ['必備：台灣駕照', '必備：日文譯本', '任務：檢查ETC卡'] } } },
{ id: 207, date: '08/06', type: 'transport', name: '移動：租車點 ➡ 善光寺', timeStart: '09:50', timeEnd: '10:05', desc: '市區行駛', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '前往甲斐善光寺', secondary_info: '適應右駕的好時機' } } },
{ id: 208, date: '08/06', type: 'sight', name: '甲斐善光寺', timeStart: '10:05', timeEnd: '10:50', desc: '武田信玄淵源地', status: 'active', expenses: [], jp_name: '甲斐善光寺', aiData: { category: 'activity', theme: 'blue', summary: { header: '歷史探訪', primary_info: '甲斐善光寺', location_keyword: 'Kai Zenkoji', stay_time: '45m', one_line_tip: '體驗本堂著名的「鳴龍」回音', tel: '055-233-7570' }, details: { title: '武田家的信仰', content: '這是由武田信玄創建的古剎。巨大的山門與本堂極具氣勢。進入金堂參拜時，務必體驗著名的「鳴き龍」——在龍圖下方拍手，可以聽到獨特的共鳴回音。', history: '戰國時代武田信玄為了避免信州善光寺被戰火波及，將其本尊遷移至此，故稱為甲斐善光寺。', photo_advice: '使用廣角鏡頭由下往上拍攝本堂的雄偉氣勢，或利用參道的松樹作為前景。', must_list: ['體驗：鳴龍回音', '體驗：戒壇巡禮 (暗道)', '必看：巨大山門'] } } },
{ id: 209, date: '08/06', type: 'transport', name: '移動：善光寺 ➡ 昇仙峽', timeStart: '10:50', timeEnd: '11:25', desc: '山路行駛', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：35m', transport_mode: 'car', primary_info: '前往昇仙峽', secondary_info: '山路蜿蜒，注意行車安全' } } },
{ id: 210, date: '08/06', type: 'sight', name: '昇仙峽 (仙娥滝)', timeStart: '11:25', timeEnd: '12:45', desc: '日本最美溪谷', status: 'active', expenses: [], jp_name: '昇仙峡', aiData: { category: 'activity', theme: 'blue', summary: { header: '絕景攝影', primary_info: '昇仙峽 (仙娥滝)', location_keyword: 'Shosenkyo', stay_time: '1hr 20m', one_line_tip: '必帶 CPL 濾鏡，拍攝瀑布絲絹感', tel: '055-287-2111' }, details: { title: '花崗岩的藝術', content: '被譽為日本最美溪谷之一。重點拍攝「仙娥滝」瀑布，花崗岩被長年侵蝕成奇岩怪石，景色壯麗。建議沿著溪谷步道散策，吸收芬多精。', history: '昇仙峽是御岳升仙峡的簡稱，是國家特別名勝，以其獨特的花崗岩斷崖與清澈溪流聞名。', photo_advice: '建議使用腳架與慢快門（搭配 ND 或 CPL 濾鏡）來表現水流的絲絹質感，並消除水面反光以凸顯岩石紋理。', must_list: ['必拍：仙娥瀑布', '必拍：覺圓峰', '必備：CPL濾鏡'] } } },
{ id: 211, date: '08/06', type: 'transport', name: '移動：昇仙峽 ➡ 午餐', timeStart: '12:45', timeEnd: '13:15', desc: '下坡', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '前往湯村溫泉區', secondary_info: '下坡路段請使用低速檔' } } },
{ id: 212, date: '08/06', type: 'food', name: '炸豬排 Kitchen 美味小家', timeStart: '13:15', timeEnd: '14:15', desc: 'Tabelog 百名店', status: 'active', expenses: [], jp_name: 'キッチン美味小家', aiData: { category: 'activity', theme: 'orange', summary: { header: '必吃午餐', primary_info: '炸豬排 Kitchen 美味小家', location_keyword: 'Kitchen Bimishoya', stay_time: '1hr', one_line_tip: 'Tabelog 百名店，推薦金華豚', tel: '055-252-7215' }, details: { title: '巷弄裡的炸豬排傳奇', content: '【美食家推薦】隱身於湯村溫泉街的實力派名店，連續多年入選 Tabelog 百名店。老闆對豬肉品種極度講究，提供「金華豚」、「高座豚」等稀有品牌豬。這裡的豬排不建議淋醬，而是沾取「岩鹽」食用，能最大限度地引出脂肪的甘甜與肉質的鮮美。', must_eat: ['金華豚ロース (金華豚里肌)', '厚切りヒレカツ (厚切菲力)', '岩鹽食用法'] } } },
{ id: 213, date: '08/06', type: 'transport', name: '移動：午餐 ➡ 花火東岸', timeStart: '14:15', timeEnd: '14:45', desc: '前往會場', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '前往東岸堤防', secondary_info: '堤防道路注意會車' } } },
{ id: 214, date: '08/06', type: 'scouting', name: '場勘：神明花火 (東岸)', timeStart: '14:45', timeEnd: '15:15', desc: '場勘', status: 'active', expenses: [], jp_name: '神明の花火大会 東岸', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '攝點確認', primary_info: '神明花火 (東岸)', location_keyword: '35.555, 138.493', stay_time: '30m', one_line_tip: '確認腳架空間與視野遮蔽', photo_guide: '廣角構圖確認' }, details: { title: 'Plan A 確認', content: '【場勘邏輯】座標 35.555, 138.493。這是順風時的最佳拍攝點。請確認河堤的草長度是否會遮擋前景，以及是否有足夠的空間架設腳架而不影響他人通道。' } } },
{ id: 215, date: '08/06', type: 'transport', name: '移動：東岸 ➡ 西岸', timeStart: '15:15', timeEnd: '15:45', desc: '跨橋', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '前往西岸高台', secondary_info: '需跨越橋梁，注意車流' } } },
{ id: 216, date: '08/06', type: 'scouting', name: '場勘：神明花火 (西岸)', timeStart: '15:45', timeEnd: '16:15', desc: '場勘', status: 'active', expenses: [], jp_name: '神明の花火大会 西岸', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '攝點確認', primary_info: '神明花火 (西岸)', location_keyword: '35.583, 138.443', stay_time: '30m', one_line_tip: '確認農道停車狀況與迴轉', photo_guide: '長焦壓縮構圖確認' }, details: { title: 'Plan B 確認', content: '【場勘邏輯】座標 35.583, 138.443。這是逆風時的避難所，位於高地。重點確認農道是否允許停車，以及夜間撤退時的動線是否順暢。' } } },
{ id: 217, date: '08/06', type: 'transport', name: '移動：西岸 ➡ 溫泉', timeStart: '16:15', timeEnd: '17:00', desc: '上山', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：45m', transport_mode: 'car', primary_info: '前往 Hottarakashi 溫泉', secondary_info: '橫跨盆地，景色開闊' } } },
{ id: 218, date: '08/06', type: 'sight', name: 'Hottarakashi 溫泉', timeStart: '17:00', timeEnd: '18:30', desc: '絕景露天溫泉', status: 'active', expenses: [], jp_name: 'ほったらかし温泉', aiData: { category: 'activity', theme: 'blue', summary: { header: '放鬆時刻', primary_info: 'Hottarakashi 溫泉', location_keyword: 'Hottarakashi Onsen', stay_time: '1hr 30m', one_line_tip: '推薦「那邊之湯」視野最廣', photo_guide: '日落前後是魔幻時刻 (停車場拍)', tel: '0553-23-1526' }, details: { title: '天空之湯', content: '這裡擁有甲府盆地最開闊的視野。推薦選擇「あっちの湯 (那邊之湯)」。日落前後是魔幻時刻，可以同時欣賞到夕陽餘暉與盆地初上的華燈。注意：溫泉內嚴禁攝影，風景照請在休息區拍攝。', history: '以「放任不管 (Hottarakashi)」為名，主打不提供過度服務，讓客人純粹享受絕景與溫泉的獨特經營理念。', must_list: ['體驗：露天風呂', '必吃：溫泉炸蛋 (温玉揚げ)', '必看：富士山日落'] } } },
{ id: 219, date: '08/06', type: 'transport', name: '移動：溫泉 ➡ 甲府站', timeStart: '18:30', timeEnd: '19:10', desc: '返回市區', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：40m', transport_mode: 'car', primary_info: '前往甲府站前', secondary_info: '下山路段，注意下班車潮' } } },
{ id: 220, date: '08/06', type: 'food', name: '奧藤本店 甲府站前', timeStart: '19:10', timeEnd: '20:10', desc: '甲府鳥內臟煮', status: 'active', expenses: [], jp_name: '奥藤本店 甲府駅前店', aiData: { category: 'activity', theme: 'orange', summary: { header: '名物晚餐', primary_info: '奧藤本店 甲府站前', location_keyword: 'Okutou Honten Kofu', stay_time: '1hr', one_line_tip: '甲府鳥內臟煮發源地 (B-1冠軍)', tel: '055-232-0910' }, details: { title: '甲府靈魂美食', content: '【美食家推薦】來到甲府，這是一間繞不開的百年老店。作為「甲府鳥內臟煮」的發祥地，這裡定義了這道 B 級美食的標準味道。濃郁的醬油糖漿緊緊包裹著新鮮的雞肝、雞胗與雞心，在口中爆發出鹹甜交織的強烈風味。搭配店家自豪的手打蕎麥麵，是甲府人最道地的待客之道。', must_eat: ['甲府鳥もつ煮 (甲府鳥內臟煮)', '手打ちそば (手打蕎麥麵)', '甲州名物馬刺し (馬肉刺身)'] } } },
{ id: 221, date: '08/06', type: 'transport', name: '移動：晚餐 ➡ 飯店', timeStart: '20:10', timeEnd: '20:30', desc: '回飯店', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：20m', transport_mode: 'car', primary_info: '前往東橫INN', secondary_info: '確認飯店停車場入口' } } },
{ id: 222, date: '08/06', type: 'sight', name: '東橫INN 甲府站南口1', timeStart: '20:30', timeEnd: '23:59', desc: '住宿休息', status: 'active', expenses: [], jp_name: '東横INN甲府駅南口1', aiData: { category: 'hub', theme: 'hub', summary: { header: '住宿', primary_info: '東橫INN 甲府站南口1', location_keyword: 'Toyoko Inn Kofu Station South 1', stay_time: 'Overnight', one_line_tip: '任務：查看 Windy 決定明日風向', tel: '055-226-1045' }, details: { title: '戰略會議', content: '辦理入住後，請打開 Windy App 查看明天下午市川三鄉町的風向預報。這將決定明天花火大會是要去「東岸 (順風)」還是「西岸 (逆風避難)」。整理器材，將相機電池充飽，明天將是此次旅程的重頭戲。' } } },




// --- Day 3: 2026/08/07 (甲府歴史散策 & 神明花火決戦) ---
{ id: 300, date: '08/07', type: 'hub', name: '退房：東橫INN', timeStart: '07:00', timeEnd: '07:15', desc: 'Check-out', status: 'active', expenses: [], jp_name: '東横INN甲府駅南口1', aiData: { category: 'hub', theme: 'hub', summary: { header: '出發', primary_info: '東橫INN 甲府站南口1', location_keyword: 'Toyoko Inn Kofu Station South 1', stay_time: '15m', one_line_tip: '寄放行李或確認車內物品' }, details: { title: '決戰日的早晨', content: '今天是神明花火大會的日子，也是山梨縣最熱鬧的一天。辦理退房手續。若接下來不租車，請將大件行李寄放在飯店；若續租或有車，請確認所有行李已上車。準備迎接漫長而精彩的一天。' } } },
{ id: 301, date: '08/07', type: 'transport', name: '移動：飯店 ➡ 加油站', timeStart: '07:15', timeEnd: '07:30', desc: '開車', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '前往 ENEOS 加油站', secondary_info: '還車前補給' }, details: { title: '最後一段自駕', content: '前往租車公司附近的加油站。早晨市區車流較少，可以輕鬆駕駛。' } } },
{ id: 302, date: '08/07', type: 'sight', name: '加油：ENEOS 甲府北店', timeStart: '07:30', timeEnd: '07:45', desc: '滿油還車', status: 'active', expenses: [], jp_name: 'ENEOS Dr.Drive 甲府北店', aiData: { category: 'logistics', theme: 'rose', summary: { header: '加油任務', primary_info: 'ENEOS Dr.Drive 甲府北店', location_keyword: 'ENEOS Kofu Kita', stay_time: '15m', one_line_tip: '加滿 Regular 並保留收據', tel: '055-252-8566' }, details: { title: '還車前的義務', content: '前往租車公司指定的加油站（或最近的加油站）將油箱加滿。請務必保留加油收據，還車時工作人員會檢查。', must_list: ['任務：加滿油(Regular)', '任務：保留收據', '任務：清理車內垃圾'] } } },
{ id: 303, date: '08/07', type: 'transport', name: '移動：加油站 ➡ ORIX', timeStart: '07:45', timeEnd: '08:00', desc: '前往還車', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '前往 ORIX 甲府站前店', secondary_info: '自駕行程結束' }, details: { title: '歸還車輛', content: '開往 ORIX 租車甲府站前店。請再次確認車內沒有遺留個人物品（手機架、充電線、ETC卡）。' } } },
{ id: 304, date: '08/07', type: 'sight', name: '還車：ORIX 甲府站前', timeStart: '08:00', timeEnd: '08:15', desc: '還車手續', status: 'active', expenses: [], jp_name: 'オリックスレンタカー甲府駅前', aiData: { category: 'logistics', theme: 'rose', summary: { header: '自駕結束', primary_info: 'ORIX 租車 甲府站前店', location_keyword: 'ORIX Rent-A-Car Kofu', stay_time: '15m', one_line_tip: '出示加油收據，取回押金', tel: '055-233-0543' }, details: { title: '告別自駕模式', content: '準時在 08:00 店家開門時抵達。辦理還車手續，結束這幾天的自駕行程。接下來我們將切換回「雙腳 + 大眾運輸」的模式。請特別檢查 ETC 卡是否拔除。', must_list: ['任務：拔除ETC卡', '任務：出示加油收據', '檢查：後車廂/門邊'] } } },
{ id: 305, date: '08/07', type: 'transport', name: '移動：ORIX ➡ 舞鶴城', timeStart: '08:15', timeEnd: '08:25', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'walk', primary_info: '前往舞鶴城公園', secondary_info: '穿越車站' }, details: { title: '早晨散步', content: '從租車店步行前往舞鶴城公園。早晨的空氣清新，適合散步。' } } },
{ id: 306, date: '08/07', type: 'sight', name: '舞鶴城公園 (甲府城跡)', timeStart: '08:25', timeEnd: '09:15', desc: '遠眺富士山', status: 'active', expenses: [], jp_name: '舞鶴城公園', aiData: { category: 'activity', theme: 'blue', summary: { header: '歷史絕景', primary_info: '舞鶴城公園 (甲府城跡)', location_keyword: 'Maizuru Castle Park', stay_time: '50m', one_line_tip: '登天守台看富士山', tel: '055-227-6179' }, details: { title: '曾經的甲斐守護', content: '雖然天守閣已不復存在，但雄偉的石垣仍訴說著當年的歷史。站在最高處的天守台，可以 360 度俯瞰甲府市區。如果運氣好，往南看去，富士山完美的錐形山體就會出現在眼前。', history: '甲府城別名舞鶴城，是豐臣秀吉為了牽制德川家康而下令建造的重鎮。', photo_advice: '利用前景的城牆石塊作為引導線，將視線引導至遠方的富士山。早晨側光能凸顯石塊的立體感。', must_list: ['必拍：天守台展望', '必拍：富士山遠景', '散步：日式庭園'] } } },
{ id: 307, date: '08/07', type: 'transport', name: '移動：舞鶴城 ➡ 夢小路', timeStart: '09:15', timeEnd: '09:30', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '前往甲州夢小路', secondary_info: '跨過鐵道天橋' }, details: { title: '前往復古街區', content: '步行前往車站北口的甲州夢小路。沿途可以欣賞鐵道風景。' } } },
{ id: 308, date: '08/07', type: 'sight', name: '甲州夢小路', timeStart: '09:30', timeEnd: '10:20', desc: '復古街區', status: 'active', expenses: [], jp_name: '甲州夢小路', aiData: { category: 'activity', theme: 'blue', summary: { header: '懷舊散策', primary_info: '甲州夢小路', location_keyword: 'Koshu Yumekouji', stay_time: '50m', one_line_tip: '明治大正風情建築', tel: '055-298-6300' }, details: { title: '時光倒流的散策', content: '位於甲府車站北口旁的復古街區，重現了明治、大正時期的甲府城下町風貌。石板路、白壁倉庫、以及地標性的「時之鐘」，營造出濃厚的懷舊氛圍。', history: '重現了昔日甲府城下町的繁榮景象，集合了許多販售山梨縣產葡萄酒、寶石飾品與和紙雜貨的特色小店。', photo_advice: '等待身延線或中央線的列車經過時，拍攝復古的「時之鐘」與現代電車同框的畫面，形成有趣的時代對比。', must_list: ['必拍：時之鐘', '必買：甲州葡萄酒', '必吃：葡萄果汁'] } } },
{ id: 309, date: '08/07', type: 'transport', name: '移動：夢小路 ➡ 武田神社', timeStart: '10:20', timeEnd: '10:50', desc: '巴士', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'bus', primary_info: '搭乘山梨交通巴士', secondary_info: '前往武田神社' }, details: { title: '前往聖地', content: '在甲府站北口搭乘巴士前往武田神社。這是一條筆直的道路，直通神社鳥居。' } } },
{ id: 310, date: '08/07', type: 'sight', name: '武田神社', timeStart: '10:50', timeEnd: '11:50', desc: '戰國名將聖地', status: 'active', expenses: [], jp_name: '武田神社', aiData: { category: 'activity', theme: 'blue', summary: { header: '勝運祈願', primary_info: '武田神社', location_keyword: 'Takeda Shrine', stay_time: '1hr', one_line_tip: '參拜勝運之神', tel: '055-252-2609' }, details: { title: '風林火山的信仰中心', content: '建立在戰國名將武田信玄的居所「躑躅崎館」遺跡之上。對於熟悉日本戰國史的人來說，這裡是絕對的聖地。神社內供奉著武田信玄，被視為「勝運」之神。', history: '信玄公在此居住了50多年，雖無巨大天守閣，但「人即城、人即石垣、人即堀」的名言便源於此地。', photo_advice: '正面的神橋與鳥居是經典構圖。寶物殿內收藏有信玄公的軍扇與鎧甲。', must_list: ['必拜：勝運祈願', '必看：姬之井戶', '必買：風林火山御守'] } } },
{ id: 311, date: '08/07', type: 'transport', name: '移動：武田神社 ➡ 甲府站', timeStart: '11:50', timeEnd: '12:10', desc: '巴士', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：20m', transport_mode: 'bus', primary_info: '返回甲府車站', secondary_info: '準備午餐' }, details: { title: '返回市區', content: '搭乘巴士返回甲府車站北口。準備享用午餐。' } } },
{ id: 312, date: '08/07', type: 'food', name: '丸政 (Marumasa)', timeStart: '12:10', timeEnd: '13:40', desc: '山賊燒與蕎麥麵', status: 'active', expenses: [], jp_name: '丸政 甲府北口店', aiData: { category: 'activity', theme: 'orange', summary: { header: '必吃午餐', primary_info: '丸政 甲府北口店', location_keyword: 'Marumasa Kofu Kitaguchi', stay_time: '1hr 30m', one_line_tip: '必點山賊燒蕎麥麵', tel: '055-252-7886' }, details: { title: '站前的豪邁滋味', content: '【美食分析】\n空間氛圍：輕鬆的站前食堂氛圍，適合旅人快速補充能量。\n味蕾報告：招牌「山賊燒」是巨大的炸雞排，外皮酥脆，帶有蒜味醬油的香氣，肉質多汁。搭配蕎麥麵的柴魚湯頭，解膩又滿足。\n點餐攻略：強烈推薦「山賊蕎麥麵 (山賊そば)」，份量十足，CP值極高。', must_eat: ['山賊そば (山賊蕎麥麵)', '山賊揚げ (單點炸雞)', '黄そば (中華麵條版)'] } } },
{ id: 313, date: '08/07', type: 'transport', name: '移動：丸政 ➡ CELEO', timeStart: '13:40', timeEnd: '13:50', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'walk', primary_info: '前往 CELEO 百貨', secondary_info: '穿越車站' }, details: { title: '前往補給', content: '從北口穿越車站自由通道前往南口的 CELEO 百貨。' } } },
{ id: 314, date: '08/07', type: 'sight', name: '購物：CELEO 百貨', timeStart: '13:50', timeEnd: '14:40', desc: '物資補給', status: 'active', expenses: [], jp_name: 'セレオ甲府', aiData: { category: 'activity', theme: 'blue', summary: { header: '後勤補給', primary_info: 'CELEO 甲府', location_keyword: 'CELEO Kofu', stay_time: '50m', one_line_tip: '購買花火大會飲食', tel: '055-224-2611' }, details: { title: '最後的後勤補給站', content: '與甲府車站直結的百貨商場。這裡是前往花火會場前，購買「戰備糧食」的最佳地點。建議在這裡的超市或熟食區買好飯糰、炸物、飲料（特別是水！），甚至是一些解饞的零食。', history: '車站直結的便利設施，是甲府市民與遊客的重要據點。', photo_advice: '無特殊攝影建議，專注於採買。', must_list: ['必買：足夠飲用水', '必買：輕食便當', '必買：濕紙巾'] } } },
{ id: 315, date: '08/07', type: 'transport', name: '移動：甲府 ➡ 花火會場', timeStart: '14:40', timeEnd: '15:40', desc: 'JR 身延線', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr', transport_mode: 'train', primary_info: 'JR 身延線', secondary_info: '甲府 -> 市川大門' }, details: { title: '前往花火之里', content: '搭乘 JR 身延線前往「市川大門站」。車程約 40 分鐘，加上步行時間。隨著列車接近目的地，車廂內穿著浴衣的人會越來越多。務必在甲府站買好「紙本來回車票」，以免回程被 IC 卡閘門卡住。' } } },
{ id: 316, date: '08/07', type: 'scouting', name: '場勘：拍攝點決策', timeStart: '15:40', timeEnd: '19:15', desc: '待機', status: 'active', expenses: [], jp_name: '神明の花火大会 会場', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '待機', primary_info: '神明花火 拍攝點', location_keyword: 'Ichikawamisato Fireworks Venue', stay_time: '3hr 35m', one_line_tip: '依風向決定位置，佔位待機', photo_guide: '確認構圖與水平' }, details: { title: '風的對決與守候', content: '抵達會場後，依據昨晚確認的風向（Windy），決定前往東岸（順風廣角）或西岸（逆風避難）。找到位置後，架好腳架，用野餐墊佔位。這段漫長的等待時間，可以用來微調構圖、上廁所、享用在 CELEO 買的美食。', history: '神明花火是山梨縣規模最大的花火大會，擁有悠久的歷史。', photo_advice: '確認地平線水平，預對焦在無限遠（或遠處建築物）。試拍幾張確認曝光。', must_list: ['任務：確認風向', '任務：佔位固定', '任務：防蚊防曬'] } } },
{ id: 317, date: '08/07', type: 'sight', name: '神明花火大會', timeStart: '19:15', timeEnd: '21:00', desc: '2萬發的震撼', status: 'active', expenses: [], jp_name: '神明の花火大会', aiData: { category: 'activity', theme: 'blue', summary: { header: '花火大會', primary_info: '神明花火大會', location_keyword: 'Shinmei Fireworks', stay_time: '1hr 45m', one_line_tip: '二尺玉與主題花火', tel: '055-272-1101' }, details: { title: '燃燒夜空的兩萬發詩篇', content: '神明花火以「故事性」與「色彩層次」聞名。整場演出像是一部電影，有起承轉合。最令人期待的是「二尺玉」的高空炸裂，那種聲音會穿透胸腔。以及最後的「Grand Finale」，超廣幅的彩虹花火將會填滿你的整個視野。', history: '江戶時代此地就是花火產地，傳承至今。', photo_advice: '使用 B 快門 (Bulb)，光圈 F8-F11，ISO 100。配合快門線，在花火升空時按下，綻放結束後放開。對於連續發射的 Star Mine，可以使用「黑卡」遮擋鏡頭，避免過曝。', must_list: ['必拍：二尺玉', '必拍：彩虹花火', '體驗：全身震動'] } } },
{ id: 318, date: '08/07', type: 'transport', name: '移動：會場 ➡ 甲府', timeStart: '21:00', timeEnd: '23:30', desc: '撤收地獄', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：2hr 30m', transport_mode: 'train', primary_info: '步行至車站 + JR 身延線', secondary_info: '人潮極度擁擠' }, details: { title: '最艱難的一哩路', content: '花火結束後，隨即開始撤收。市川大門站會有嚴格的入場管制，排隊時間可能很長。請保持耐心，這是一場體力與意志力的考驗。手中如果有紙本車票，進站速度會稍微快一點。' } } },
{ id: 319, date: '08/07', type: 'food', name: '天ぷら酒場 KUSUKE', timeStart: '23:30', timeEnd: '00:30', desc: '深夜天婦羅', status: 'active', expenses: [], jp_name: '天ぷら酒場 KUSUKE', aiData: { category: 'activity', theme: 'orange', summary: { header: '深夜食堂', primary_info: '天ぷら酒場 KUSUKE', location_keyword: 'Tempura Sakaba Kusuke', stay_time: '1hr', one_line_tip: '必點半熟蛋天婦羅', tel: '050-5487-7357' }, details: { title: '酥脆的深夜誘惑', content: '【美食分析】\n空間氛圍：位於甲府站南口附近的時髦居酒屋，明亮的燈光與熱鬧的氣氛，非常適合花火大會後的二次會。開放式廚房可以聽到炸天婦羅的悅耳聲響，讓人食慾大開。\n味蕾報告：這裡的天婦羅麵衣薄透酥脆，完全沒有油耗味。選用當地的「甲州信玄雞」肉質鮮嫩多汁，搭配特製鹽食用風味更佳。最令人驚豔的是「大根煮天婦羅」，將燉煮過的蘿蔔再油炸，外酥內軟充滿高湯鮮甜。\n點餐攻略：甲州信玄雞天婦羅、半熟蛋天婦羅、大根煮天婦羅。', must_eat: ['甲州信玄雞天婦羅', '半熟蛋天婦羅', '大根煮天婦羅'] } } },
{ id: 320, date: '08/07', type: 'transport', name: '移動：天ぷら酒場 KUSUKE ➡ 巴士站', timeStart: '00:30', timeEnd: '00:40', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'walk', primary_info: '前往巴士乘車處', secondary_info: '準備搭乘夜巴' }, details: { title: '前往下一站', content: '步行前往甲府站南口的巴士乘車處。' } } },
{ id: 321, date: '08/07', type: 'hub', name: '甲府站南口 (巴士待機)', timeStart: '00:40', timeEnd: '01:10', desc: '巴士待機', status: 'active', expenses: [], jp_name: '甲府駅南口 バスターミナル', aiData: { category: 'hub', theme: 'hub', summary: { header: '轉運', primary_info: '甲府站南口 巴士乘車處', location_keyword: 'Kofu Station Bus Terminal', stay_time: '30m', one_line_tip: '確認巴士班次與位置' }, details: { title: '再見甲府', content: '在深夜的巴士站等待。整理一下隨身行李，將頸枕拿出，準備在夜行巴士上補眠。這三天在山梨的冒險畫下句點。' } } },
{ id: 322, date: '08/07', type: 'transport', name: '移動：甲府 ➡ 京都', timeStart: '01:10', timeEnd: '02:00', desc: '夜行巴士', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：50m+', transport_mode: 'bus', primary_info: '夜行巴士', secondary_info: '前往下一個目的地' }, details: { title: '夢中移動', content: '搭乘夜行巴士前往下一個目的地（如京都或大阪）。在車上好好休息。' } } },


// --- Day 4: 2026/08/08 (琵琶湖花火決戰日：西岸 vs 東岸) ---
{ id: 400, date: '08/08', type: 'hub', name: '抵達：京都駅八条口', timeStart: '07:20', timeEnd: '07:20', desc: '夜巴抵達', status: 'active', expenses: [], jp_name: '京都駅八条口 G2', aiData: { category: 'hub', theme: 'hub', summary: { header: '抵達', primary_info: '京都駅八条口 (G2)', location_keyword: 'Kyoto Station Hachijo Exit G2', stay_time: '0m', one_line_tip: '下車檢查隨身物品' }, details: { title: '古都的早晨', content: '經歷了一夜的巴士移動，終於抵達京都。下車點通常在八條口（後站）。早晨的京都車站周邊相對安靜。請先確認隨身行李，稍微伸展筋骨，準備前往就在附近的飯店寄放行李。' } } },
{ id: 401, date: '08/08', type: 'transport', name: '移動：車站 ➡ 飯店', timeStart: '07:20', timeEnd: '07:35', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '前往相鐵弗雷薩', secondary_info: '步行前往' }, details: { title: '前往據點', content: '相鐵弗雷薩飯店就在 G2 巴士站牌的對面區域，步行距離極短。這 15 分鐘包含去便利商店買水或借用廁所的時間。' } } },
{ id: 402, date: '08/08', type: 'sight', name: '寄物：相鐵弗雷薩', timeStart: '07:35', timeEnd: '08:00', desc: '寄放行李', status: 'active', expenses: [], jp_name: '相鉄フレッサイン 京都駅八条口', aiData: { category: 'logistics', theme: 'rose', summary: { header: '後勤', primary_info: '相鉄フレッサイン 京都駅八条口', location_keyword: 'Sotetsu Fresa Inn Kyoto-Hachijoguchi', stay_time: '25m', one_line_tip: '寄放行李，整理儀容', tel: '075-284-0203' }, details: { title: '輕裝整備', content: '辦理行李寄放手續。這是一個重要的整備點，可以在大廳簡單整理儀容，刷牙洗臉，讓自己從夜巴的疲憊中清醒過來。取出今天要用的攝影器材與駕照資料，準備前往租車。' } } },
{ id: 403, date: '08/08', type: 'transport', name: '移動：飯店 ➡ ORIX', timeStart: '08:00', timeEnd: '08:10', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'walk', primary_info: '前往 ORIX 京都站前', secondary_info: '新幹線口方向' }, details: { title: '前往取車', content: '步行前往位於京都站前（新幹線口/八條口側）的 ORIX 租車店。' } } },
{ id: 404, date: '08/08', type: 'sight', name: '租車：ORIX 京都站前', timeStart: '08:10', timeEnd: '08:40', desc: '取車手續', status: 'active', expenses: [], jp_name: 'オリックスレンタカー京都駅前新幹線口店', aiData: { category: 'logistics', theme: 'rose', summary: { header: '租車', primary_info: 'ORIX 租車 新幹線口店', location_keyword: 'ORIX Rent-A-Car Kyoto Station Shinkansen', stay_time: '30m', one_line_tip: '花火日租車人多，務必準時', tel: '075-661-0543' }, details: { title: '琵琶湖戰車入手', content: '今天是琵琶湖花火大會，租車需求極高，店內可能會比較擁擠。請備妥預約單號、台灣駕照與日文譯本，迅速完成手續。檢查車況時，特別留意冷氣是否正常，因為今天會長時間待在車上避暑。', must_list: ['必備：駕照/譯本', '任務：檢查冷氣', '任務：設定導航'] } } },

// --- PLAN A: 西教寺 (西岸高地攝影) ---
{ id: 405, date: '08/08', type: 'transport', name: '移動：京都 ➡ 西教寺', timeStart: '08:40', timeEnd: '09:20', desc: '西大津Bypass', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：40m', transport_mode: 'car', primary_info: '前往西教寺', secondary_info: '經由西大津 Bypass' }, details: { title: '前往西岸', content: '行駛西大津 Bypass 前往大津市北部的西教寺。這條路早上通常順暢，但越接近大津市區車流會越多。' } } },
{ id: 406, date: '08/08', type: 'scouting', name: '場勘 1：西教寺停車場', timeStart: '09:20', timeEnd: '09:50', desc: '首選卡位', status: 'active', plan: 'A', expenses: [], jp_name: '西教寺 参拝者専用駐車場', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '場勘 1', primary_info: '西教寺 參拜者專用停車場', location_keyword: 'Saikyoji Parking', stay_time: '30m', one_line_tip: '確認視野與停車狀況', photo_guide: '俯瞰琵琶湖全景' }, details: { title: 'Plan A 首選：西教寺', content: '西教寺位於高地，停車場視野開闊，可以俯瞰琵琶湖花火，且有廁所與販賣機，是極佳的拍攝點。確認是否可以長時間停車以及夜間是否會關閉。若位置理想，可考慮直接在此佔位。' } } },
{ id: 407, date: '08/08', type: 'scouting', name: '場勘 2：備用座標 A', timeStart: '09:20', timeEnd: '09:50', desc: '備案座標', status: 'active', plan: 'A', expenses: [], jp_name: '備用攝點 A', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '場勘 2', primary_info: '備用座標 A', location_keyword: '35.079167, 135.866944', stay_time: '30m', one_line_tip: '西教寺周邊農道', photo_guide: '注意電線干擾' }, details: { title: 'Plan A 備案：周邊農道', content: '若西教寺停車場客滿或視野受阻，請前往此座標確認。這通常是附近的農道或空地，需確認是否影響農家作業以及是否允許停車。' } } },
{ id: 408, date: '08/08', type: 'scouting', name: '場勘 3：備用座標 B', timeStart: '09:20', timeEnd: '09:50', desc: '備案座標', status: 'active', plan: 'A', expenses: [], jp_name: '備用攝點 B', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '場勘 3', primary_info: '備用座標 B', location_keyword: '35.080805, 135.871924', stay_time: '30m', one_line_tip: '高地視野確認', photo_guide: '長焦壓縮構圖' }, details: { title: 'Plan A 備案：高地', content: '另一個備選的高地座標。重點確認：1. 視野是否有樹木遮擋 2. 車輛迴轉空間 3. 是否為私有地。' } } },
{ id: 409, date: '08/08', type: 'transport', name: '移動：西教寺 ➡ 白鬚神社', timeStart: '09:50', timeEnd: '10:30', desc: '湖西道路', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：40m', transport_mode: 'car', primary_info: '前往白鬚神社', secondary_info: '沿湖西道路北上' }, details: { title: '北上觀光', content: '確認好晚上的拍攝點後，沿著湖西道路北上前往白鬚神社。這段路沿著琵琶湖行駛，風景優美。' } } },
{ id: 410, date: '08/08', type: 'sight', name: '白鬚神社', timeStart: '10:30', timeEnd: '11:10', desc: '湖中鳥居', status: 'active', plan: 'A', expenses: [], jp_name: '白鬚神社', aiData: { category: 'activity', theme: 'blue', summary: { header: '經典攝影', primary_info: '白鬚神社', location_keyword: '35.27431103364028, 136.01077996372064', stay_time: '40m', one_line_tip: '過馬路請極度小心', tel: '0740-36-1555', photo_guide: '長焦拍攝鳥居' }, details: { title: '近江的嚴島', content: '矗立在琵琶湖中的朱紅色大鳥居，是近江最經典的風景。雖然遊客眾多，但依然值得一拍。神社本殿位於馬路對面，國道 161 號車流量極大且車速快，過馬路時請務必注意安全，建議使用神社旁的人行天橋或指定穿越點（若有）。', history: '近江最古老的大社，祭祀長壽之神。', photo_advice: '使用長焦鏡頭壓縮鳥居與背景的沖島，可以避開湖面上玩立槳的人群。', must_list: ['必拍：湖中鳥居', '必拜：長壽之神', '注意：交通安全'] } } },
{ id: 411, date: '08/08', type: 'transport', name: '移動：神社 ➡ 餐廳', timeStart: '11:10', timeEnd: '11:40', desc: '折返堅田', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '前往農家餐廳 Daikichi', secondary_info: '往南折返' }, details: { title: '前往午餐', content: '往南折返堅田方向。目標是當地知名的近江牛餐廳。' } } },
{ id: 412, date: '08/08', type: 'food', name: '農家餐廳 Daikichi', timeStart: '11:40', timeEnd: '12:40', desc: '近江牛午餐', status: 'active', plan: 'A', expenses: [], jp_name: '農家レストラン だいきち 堅田店', aiData: { category: 'activity', theme: 'orange', summary: { header: '必吃午餐', primary_info: '農家レストラン だいきち 堅田店', location_keyword: 'Daikichi Katata', stay_time: '1hr', one_line_tip: '自家牧場直營近江牛', tel: '077-572-0070' }, details: { title: '農家直營的鮮度', content: '【美食分析】\n空間氛圍：由創業百年的大吉牧場直營，店內充滿溫馨的木質調與家庭感。避開正午 12 點的尖峰時刻是明智之舉。\n味蕾報告：這裡的近江牛漢堡排肉汁豐富，口感紮實；燒肉定食則能直接品嚐到近江牛特有的油脂甜味，肉質軟嫩，入口即化。米飯也是自家種植的近江米，香氣十足。\n點餐攻略：推薦「近江牛漢堡排定食」或「近江牛燒肉御膳」。', must_eat: ['近江牛漢堡排', '近江牛燒肉', '自家製米飯'] } } },
{ id: 413, date: '08/08', type: 'transport', name: '移動：餐廳 ➡ 浮御堂', timeStart: '12:40', timeEnd: '12:50', desc: '短程移動', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'car', primary_info: '前往浮御堂', secondary_info: '就在附近' }, details: { title: '前往名勝', content: '駕車前往附近的浮御堂。' } } },
{ id: 414, date: '08/08', type: 'sight', name: '浮御堂 (滿月寺)', timeStart: '12:50', timeEnd: '13:20', desc: '近江八景', status: 'active', plan: 'A', expenses: [], jp_name: '浮御堂 (満月寺)', aiData: { category: 'activity', theme: 'blue', summary: { header: '湖上建築', primary_info: '浮御堂 (滿月寺)', location_keyword: 'Ukimido Mangetsuji', stay_time: '30m', one_line_tip: '拍攝突出湖面的佛堂', tel: '077-572-0455' }, details: { title: '堅田落雁', content: '近江八景之一的「堅田落雁」。這座佛堂彷彿漂浮在琵琶湖上，優雅的姿態與湖光山色融為一體。走在通往佛堂的棧橋上，可以感受到湖風吹拂，視野極佳。', history: '平安時代為了祈求湖上安全而建。', photo_advice: '利用松樹作為前景框架拍攝佛堂，或用廣角拍攝佛堂延伸入湖的透視感。', must_list: ['必拍：湖上佛堂', '必看：千體佛', '體驗：湖風'] } } },
{ id: 415, date: '08/08', type: 'transport', name: '移動：浮御堂 ➡ 超市', timeStart: '13:20', timeEnd: '13:30', desc: '短程移動', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'car', primary_info: '前往 Al Plaza 堅田', secondary_info: '最後補給' }, details: { title: '物資採買', content: '前往大型超市 Al Plaza 堅田進行最後補給。' } } },
{ id: 416, date: '08/08', type: 'sight', name: '補給：Al Plaza 堅田', timeStart: '13:30', timeEnd: '14:00', desc: '戰略補給', status: 'active', plan: 'A', expenses: [], jp_name: 'アル・プラザ堅田', aiData: { category: 'logistics', theme: 'rose', summary: { header: '採買', primary_info: 'アル・プラザ堅田', location_keyword: 'Al Plaza Katata', stay_time: '30m', one_line_tip: '買晚餐、大量水、冰塊', tel: '077-573-3111' }, details: { title: '長期抗戰準備', content: '這是進入攝影點前的最後補給站。請務必買齊晚餐（便當、熟食）、大量的飲用水（車上待機很熱）、以及消暑用的冰塊或涼感濕紙巾。' } } },
{ id: 417, date: '08/08', type: 'transport', name: '移動：超市 ➡ 西教寺', timeStart: '14:00', timeEnd: '14:15', desc: '回防', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '返回西教寺', secondary_info: '準時卡位' }, details: { title: '進入陣地', content: '帶著物資，準時回到早上確認過的西教寺停車場或備案點進行佔位。' } } },

// --- PLAN B: 志那-1 (東岸湖畔攝影) ---
{ id: 418, date: '08/08', type: 'transport', name: '移動：京都 ➡ 志那1', timeStart: '08:40', timeEnd: '09:30', desc: '前往東岸', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：50m', transport_mode: 'car', primary_info: '前往志那1停車場', secondary_info: '經由國道1號/京滋Bypass' }, details: { title: '前往湖岸綠地', content: 'Plan B 選擇東岸的湖岸綠地。經由國道 1 號前往草津市的志那地區。這裡是花火的一級戰區，需提早抵達。' } } },
{ id: 419, date: '08/08', type: 'scouting', name: '場勘 1：志那1 (中)', timeStart: '09:30', timeEnd: '10:00', desc: '首選卡位', status: 'active', plan: 'B', expenses: [], jp_name: 'タイムズ志那１（中）', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '場勘 1', primary_info: 'Times 志那1 (中)', location_keyword: '35.050376, 135.918731', stay_time: '30m', one_line_tip: '若車位滿80%，直接待機不離開', photo_guide: '湖面低角度倒影' }, details: { title: 'Plan B 決策點', content: '志那1 (中) 是琵琶湖花火大會的一級戰區，也是極熱門的停車場。抵達時請立即評估車位狀況。如果發現已經停滿八成，強烈建議不要離開，直接放棄後續的白鬚神社行程，在此停車待機。這時候離開很可能就回不來了，寧可派人走路或搭計程車去買補給，也要守住車位。' } } },
{ id: 420, date: '08/08', type: 'scouting', name: '場勘 2：志那1 (北)', timeStart: '09:30', timeEnd: '10:00', desc: '備案卡位', status: 'active', plan: 'B', expenses: [], jp_name: '志那-１北駐車場', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '場勘 2', primary_info: '志那1 北停車場', location_keyword: '35.050988, 135.919828', stay_time: '30m', one_line_tip: '確認備用車位', photo_guide: '視野確認' }, details: { title: 'Plan B 備案', content: '如果中間的停車場已滿，請不要猶豫，立即前往北側的停車場確認狀況。這兩個停車場距離很近，但早晨是搶車位的關鍵期，動作稍慢可能就會錯失良機。確認好車位後，務必記住停車位置。' } } },
{ id: 421, date: '08/08', type: 'transport', name: '移動：志那 ➡ 白鬚神社', timeStart: '10:00', timeEnd: '10:50', desc: '高風險移動', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：50m', transport_mode: 'car', primary_info: '前往白鬚神社', secondary_info: '需跨越琵琶湖大橋' }, details: { title: '風險評估', content: '若順利停好車（或決定冒險離開），前往白鬚神社需跨越琵琶湖大橋。**警語：若橋上塞車，請立刻放棄白鬚神社**，改去附近的佐川美術館，以免回不來。' } } },
{ id: 422, date: '08/08', type: 'sight', name: '白鬚神社 (快閃)', timeStart: '10:50', timeEnd: '11:20', desc: '縮短停留', status: 'active', plan: 'B', expenses: [], jp_name: '白鬚神社', aiData: { category: 'activity', theme: 'blue', summary: { header: '快閃攝影', primary_info: '白鬚神社', location_keyword: 'Shirahige Shrine', stay_time: '30m', one_line_tip: '儘快折返，注意時間', tel: '0740-36-1555' }, details: { title: '分秒必爭的參拜', content: '為了趕回東岸，這裡只能做短暫停留。快速拍攝湖中鳥居，參拜後立即準備折返。' } } },
{ id: 423, date: '08/08', type: 'transport', name: '移動：神社 ➡ 壽司', timeStart: '11:20', timeEnd: '12:15', desc: '回東岸', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：55m', transport_mode: 'car', primary_info: '前往なごやか亭 草津木川店', secondary_info: '再次跨越琵琶湖大橋' }, details: { title: '返回東岸', content: '再次跨越琵琶湖大橋回到草津方向。這段路程風險較高，需密切注意導航預估時間。' } } },
{ id: 424, date: '08/08', type: 'food', name: 'なごやか亭 草津木川店', timeStart: '12:15', timeEnd: '13:10', desc: '北海道迴轉壽司', status: 'active', plan: 'B', expenses: [], jp_name: 'なごやか亭 草津木川店', aiData: { category: 'activity', theme: 'orange', summary: { header: '人氣午餐', primary_info: 'なごやか亭 草津木川店', location_keyword: 'Nagoyakatei Kusatsu', stay_time: '55m', one_line_tip: '建議提前用 App 抽號碼牌', tel: '077-569-0520' }, details: { title: '滋賀吃北海道名店', content: '【美食分析】\n這家源自北海道釧路的迴轉壽司，在滋賀竟然有分店！\n味蕾報告：這裡的「溢出來鮭魚卵 (こぼれいくら)」是視覺與味覺的雙重衝擊，豪邁地堆滿鮭魚卵。北海道直送的干貝與牡丹蝦鮮度沒話說。\n點餐攻略：溢出來鮭魚卵、北海道干貝、牡丹蝦。建議提前用 EPARK App 抽號碼牌。', must_eat: ['溢出來鮭魚卵', '北海道大干貝', '牡丹蝦'] } } },
{ id: 425, date: '08/08', type: 'transport', name: '移動：壽司 ➡ 麵包', timeStart: '13:10', timeEnd: '13:20', desc: '短程移動', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'car', primary_info: '前往 Pain du Marché', secondary_info: '就在附近' }, details: { title: '前往麵包店', content: '駕車前往草津的人氣麵包店。' } } },
{ id: 426, date: '08/08', type: 'sight', name: '購物：Pain du Marché', timeStart: '13:20', timeEnd: '13:35', desc: '人氣麵包', status: 'active', plan: 'B', expenses: [], jp_name: 'パン・ドゥ・マルシェ', aiData: { category: 'activity', theme: 'orange', summary: { header: '點心採買', primary_info: 'Pain du Marché', location_keyword: 'Pain du Marché Kusatsu', stay_time: '15m', one_line_tip: '滋賀人氣第一麵包店', tel: '077-514-8810' }, details: { title: '花火等待良伴', content: '這是滋賀縣評價極高的麵包店。買一些耐放的歐式麵包或鹹麵包，作為下午漫長等待時間的乾糧或點心。推薦這裡的硬法與可頌。', must_eat: ['明太子法國麵包', '可頌'] } } },
{ id: 427, date: '08/08', type: 'transport', name: '移動：麵包 ➡ 超市', timeStart: '13:35', timeEnd: '13:45', desc: '短程移動', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'car', primary_info: '前往 Valor 超市', secondary_info: '最後補給' }, details: { title: '前往超市', content: '前往附近的 Valor 超市進行最後採購。' } } },
{ id: 428, date: '08/08', type: 'sight', name: '補給：Valor 草津店', timeStart: '13:45', timeEnd: '14:05', desc: '戰略補給', status: 'active', plan: 'B', expenses: [], jp_name: 'スーパーマーケットバロー 草津店', aiData: { category: 'logistics', theme: 'rose', summary: { header: '採買', primary_info: 'Valor 超市 草津店', location_keyword: 'Valor Kusatsu', stay_time: '20m', one_line_tip: '快速採買飲料與熟食', tel: '077-565-3000' }, details: { title: '最後物資站', content: '快速採買晚餐（熟食、炸物）、大量的飲料與冰塊。花火大會現場買東西不方便，這裡要一次買齊。' } } },
{ id: 429, date: '08/08', type: 'transport', name: '移動：超市 ➡ 志那1', timeStart: '14:05', timeEnd: '14:20', desc: '回防', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '返回志那1停車場', secondary_info: '務必在管制前抵達' }, details: { title: '最後衝刺', content: '祈禱停車場還有位置。務必在 14:30 交通管制變嚴之前進入湖岸道路。' } } },

// --- 共同行程 (長期抗戰與花火) ---
{ id: 430, date: '08/08', type: 'scouting', name: '待機：攝影點', timeStart: '14:20', timeEnd: '19:30', desc: '長期抗戰', status: 'active', expenses: [], jp_name: '撮影ポイント待機', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '待機', primary_info: '最終選定攝影點', location_keyword: 'Biwako Fireworks Spot', stay_time: '5hr 10m', one_line_tip: '車停好不要動，架腳架', photo_guide: '確認構圖與公廁位置' }, details: { title: '意志力的考驗', content: '1. 車子停好後絕對不要再移動，否則車位會瞬間被搶走。\n2. 架設腳架佔位，確認水平與構圖。\n3. 在車上或陰涼處休息，享用剛剛買的麵包與壽司。\n4. 確認最近的流動廁所位置，排隊人潮會很多，請預留時間。這是一場漫長的等待，保持體力與耐心。' } } },
{ id: 431, date: '08/08', type: 'sight', name: '琵琶湖大花火大會', timeStart: '19:30', timeEnd: '20:30', desc: '湖上花火', status: 'active', expenses: [], jp_name: 'びわ湖大花火大会', aiData: { category: 'activity', theme: 'blue', summary: { header: '實戰', primary_info: '琵琶湖大花火大會', location_keyword: 'Biwako Fireworks', stay_time: '1hr', one_line_tip: '注意煙霧與倒影', tel: '077-511-1530' }, details: { title: '夏夜的交響詩', content: '琵琶湖花火以湖面扇形花火與傾斜發射聞名。若在西岸（高地），重點是拍攝花火與大津夜景的魄力感，注意煙霧消散狀況。若在東岸（湖岸），重點是捕捉花火在湖面上的倒影，如果吹西風，這裡的觀賞條件會非常好，煙霧較少。' } } },
{ id: 432, date: '08/08', type: 'transport', name: '移動：撤收 ➡ 京都', timeStart: '20:30', timeEnd: '23:30', desc: '地獄塞車', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：3.5hr+', transport_mode: 'car', primary_info: '返回京都飯店', secondary_info: '要有深夜抵達的心理準備' }, details: { title: '紅色車河', content: '花火結束後，周邊道路將陷入完全癱瘓。預估車程需 2.5 至 4 小時。若在東岸，可考慮繞南邊的「近江大橋」回京都，雖然稍微繞路但可能比塞在琵琶湖大橋或西岸好一點。請保持耐心，安全駕駛。' } } },
{ id: 433, date: '08/08', type: 'hub', name: '休息：相鐵弗雷薩', timeStart: '23:30', timeEnd: '23:40', desc: '深夜抵達', status: 'active', expenses: [], jp_name: '相鉄フレッサイン 京都駅八条口', aiData: { category: 'hub', theme: 'hub', summary: { header: '終點', primary_info: '相鐵弗雷薩 京都八條口', location_keyword: 'Sotetsu Fresa Inn Kyoto', stay_time: 'Overnight', one_line_tip: '領取行李，休息', tel: '075-284-0203' }, details: { title: '漫長的一日', content: '終於回到飯店。領取早上寄放的行李，辦理入住。今天經歷了酷熱、長途駕駛與塞車，辛苦了。快速洗澡休息，明天還有京都的行程等著您。' } } },
{ id: 434, date: '08/08', type: 'sight', name: '停車場 A：京都駅八条口', timeStart: '23:40', timeEnd: '23:59', desc: '大型立體', status: 'active', expenses: [], jp_name: '京都駅八条口駐車場', aiData: { category: 'logistics', theme: 'rose', summary: { header: '停車 A', primary_info: '京都駅八条口駐車場', location_keyword: 'Kyoto Station Hachijoguchi Parking', stay_time: '19m', one_line_tip: '夜間每小時100円，00:00~09:00最大料金500円', tel: '075-691-4543' }, details: { title: '安全穩定的官方選擇', content: '這是由京都市營運的大型立體停車場（Avanty 旁）。雖然日間收費較高，但夜間時段 (22:00-08:00) 費率會降至每 60 分鐘 100 日圓。這意味著停整個晚上大約只需 1000 日圓左右。優點是車位多、有管理員、且位於室內，不用擔心車子被路人刮傷或日曬雨淋，是保護攝影器材與車輛的最安全選擇。' } } },
{ id: 435, date: '08/08', type: 'sight', name: '停車場 B：Concept Coin', timeStart: '23:40', timeEnd: '23:59', desc: '超低價', status: 'active', expenses: [], jp_name: 'コンセプト八条口東コインパーキング', aiData: { category: 'logistics', theme: 'rose', summary: { header: '停車 B', primary_info: 'コンセプト八条口東', location_keyword: 'Concept Hachijoguchi Higashi', stay_time: '19m', one_line_tip: '夜間最大料金12HR 900円', tel: '0120-926-036' }, details: { title: '價格破壞者', content: 'Concept 系列通常是京都巷弄內價格最激進的停車場。位於車站東南側的巷弄內，夜間 (20:00-08:00) 的最大料金通常設定得非常低，約在 300 至 500 日圓之間。缺點是車位數量極少，且巷弄較為狹窄，如果是駕駛大型車輛需要多加留意。適合想將預算壓到最低的旅人。' } } },
{ id: 436, date: '08/08', type: 'sight', name: '停車場 C：Times 南第3', timeStart: '23:40', timeEnd: '23:59', desc: '標準備案', status: 'active', expenses: [], jp_name: 'タイムズ京都駅南第３', aiData: { category: 'logistics', theme: 'rose', summary: { header: '停車 C', primary_info: 'タイムズ京都駅南第３', location_keyword: 'Times Kyoto Station Minami No.3', stay_time: '19m', one_line_tip: '夜間最大料金20:00~08:00 400円', tel: '0120-77-8924' }, details: { title: '信用卡支付的便利', content: 'Times 是日本最大的連鎖停車場，品質穩定且支援信用卡支付。這區的 Times 夜間最大料金行情大約落在 500 至 700 日圓之間 (18:00 或 20:00 起算)。雖然比 Concept 稍貴一點點，但設備通常較新，場地照明也較充足。若身上現金不足，這裡是最佳的備案。' } } },





// --- Day 5: 2026/08/09 (京都最終日：古典與美食) ---
{ id: 501, date: '08/09', type: 'sight', name: '後勤：整理退房', timeStart: '07:00', timeEnd: '07:30', desc: 'Check-out', status: 'active', expenses: [], jp_name: '京都八条口相鉄フレッサ', aiData: { category: 'hub', theme: 'hub', summary: { header: '本日起點', primary_info: '京都八條口相鐵弗雷薩', location_keyword: 'Sotetsu Fresa Inn Kyoto-Hachijoguchi', stay_time: '30m', one_line_tip: '確認行李與隨身物品', tel: '075-284-0203' }, details: { title: '旅程的最後一天', content: '整理行李並辦理退房手續。這是本日行程的起點錨點，請確保沒有遺漏任何物品在房間內。將大件行李寄放在櫃台，只帶隨身貴重物品與相機出發。' } } },
{ id: 502, date: '08/09', type: 'transport', name: '移動：飯店 ➡ 加油站', timeStart: '07:30', timeEnd: '07:35', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：5m', transport_mode: 'car', primary_info: '前往 ENEOS', secondary_info: '最後一段自駕' }, details: { title: '前往補給', content: '駕車前往附近的加油站。這是還車前的必要步驟。' } } },
{ id: 503, date: '08/09', type: 'sight', name: '後勤：加油 (Regular)', timeStart: '07:35', timeEnd: '07:45', desc: '還車前補給', status: 'active', expenses: [], jp_name: 'ENEOS Dr.Drive 九条SS', aiData: { category: 'logistics', theme: 'rose', summary: { header: '加油', primary_info: 'ENEOS EneJet 九条SS', location_keyword: 'ENEOS EneJet Dr.Drive Kujo', stay_time: '10m', one_line_tip: '保留收據供查驗', tel: '075-691-3226' }, details: { title: '加油任務', content: '歸還租賃車前的必要任務。請加滿 Regular (紅色油槍) 並妥善保管收據。這家加油站距離還車點非常近，動線順暢。', must_list: ['任務：加滿油', '任務：保留收據', '任務：清空垃圾'] } } },
{ id: 504, date: '08/09', type: 'transport', name: '移動：加油站 ➡ ORIX', timeStart: '07:45', timeEnd: '07:55', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'car', primary_info: '前往還車點', secondary_info: '檢查車內遺留物' }, details: { title: '歸還', content: '前往 ORIX 租車新幹線口店。請在抵達前最後一次檢查車內是否有遺落物，特別是 ETC 卡與墨鏡。' } } },
{ id: 505, date: '08/09', type: 'sight', name: '後勤：ORIX 還車', timeStart: '07:55', timeEnd: '08:25', desc: '新幹線口店', status: 'active', expenses: [], jp_name: 'オリックスレンタカー京都駅前新幹線口店', aiData: { category: 'logistics', theme: 'rose', summary: { header: '還車', primary_info: 'ORIX 租車 新幹線口店', location_keyword: 'ORIX Rent-A-Car Kyoto Station', stay_time: '30m', one_line_tip: '交通模式轉換：自駕結束', tel: '075-661-0543' }, details: { title: '自駕模式結束', content: '完成車輛檢查與歸還手續。出示加油收據，取回押金（若有）。接下來將轉換為大眾交通工具模式，請準備好 ICOCA 或 Suica 卡。', must_list: ['檢查：ETC卡拔除', '任務：出示收據', '準備：IC卡'] } } },
{ id: 506, date: '08/09', type: 'transport', name: '移動：ORIX ➡ 琉璃光院', timeStart: '08:25', timeEnd: '09:25', desc: '地鐵/巴士', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：60m', transport_mode: 'public', primary_info: '地鐵轉巴士 (八瀨方面)', secondary_info: '長距離移動' }, details: { title: '前往八瀨', content: '從京都車站搭乘地鐵烏丸線至「國際會館站」，再轉乘京都巴士前往「八瀨站前」。這是一段從市區前往山邊的旅程，沿途景色逐漸轉綠。' } } },
{ id: 507, date: '08/09', type: 'sight', name: '琉璃光院', timeStart: '09:25', timeEnd: '11:25', desc: '光影與倒影', status: 'active', expenses: [], jp_name: '瑠璃光院', aiData: { category: 'activity', theme: 'blue', summary: { header: '絕景攝影', primary_info: '八瀨 琉璃光院', location_keyword: 'Rurikoin', stay_time: '2hr', one_line_tip: '二樓書院桌面倒影', photo_guide: '利用桌面反射拍攝', tel: '075-781-4001' }, details: { title: '極致的鏡面美學', content: '琉璃光院以其二樓書院的黑漆桌面倒影聞名。窗外的楓葉（夏季為青楓，秋季為紅葉）倒映在光潔的桌面上，形成如夢似幻的綠色光影世界。這裡通常需要預約或排隊，建議一早抵達。除了二樓，一樓的「瑠璃之庭」苔蘚與光影也極具禪意。', history: '原為本願寺歷代住持的別邸，後改為寺院。其庭園由明治時期的造園師設計，極具藝術價值。', photo_advice: '將相機貼近桌面，利用低角度拍攝倒影，創造出上下對稱的幾何構圖。記得關閉閃光燈。', must_list: ['必拍：書院倒影', '必看：瑠璃之庭', '體驗：抄經'] } } },
{ id: 508, date: '08/09', type: 'transport', name: '移動：琉璃光院 ➡ 三十三間堂', timeStart: '11:25', timeEnd: '12:35', desc: '巴士/京阪電車', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：70m', transport_mode: 'public', primary_info: '出町柳轉乘京阪線', secondary_info: '七條站下車' }, details: { title: '返回市區', content: '搭乘叡山電鐵至「出町柳站」，轉乘京阪本線特急至「七條站」。這是一條便捷的路線，可以直接抵達三十三間堂附近。' } } },
{ id: 509, date: '08/09', type: 'sight', name: '三十三間堂', timeStart: '12:35', timeEnd: '13:35', desc: '千手觀音', status: 'active', expenses: [], jp_name: '蓮華王院 三十三間堂', aiData: { category: 'activity', theme: 'blue', summary: { header: '國寶巡禮', primary_info: '蓮華王院 三十三間堂', location_keyword: 'Sanjusangendo', stay_time: '1hr', one_line_tip: '捕捉長廊縱深感', photo_guide: '內部禁止攝影，拍外觀', tel: '075-561-0467' }, details: { title: '千尊觀音的視覺衝擊', content: '日本國寶級建築，供奉著 1001 尊千手觀音像。長達 120 公尺的木造大殿是日本之最。雖然堂內嚴禁攝影，但那種千尊金佛排列的視覺震撼力與肅穆氣場，絕對值得親眼見證。攝影重點在於建築外觀的長廊縱深感，以及庭園的四季變化。', history: '由平清盛受後白河上皇之命創建，曾經歷火災重建。其名稱源於正殿柱間有 33 個間隔。', photo_advice: '利用廣角鏡頭拍攝建築外觀的全景，或用長焦壓縮長廊的柱列。', must_list: ['必看：千體千手觀音', '必看：雷神風神像', '體驗：通矢射箭場'] } } },
{ id: 510, date: '08/09', type: 'transport', name: '移動：三十三間堂 ➡ 祇園', timeStart: '13:35', timeEnd: '14:05', desc: '巴士', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'public', primary_info: '市營巴士', secondary_info: '前往午餐點' }, details: { title: '前往午餐', content: '搭乘京都市營巴士前往四條河原町或祇園周邊。準備享用京都的頂級午餐。' } } },
{ id: 511, date: '08/09', type: 'food', name: '【主推】三嶋亭 (壽喜燒)', timeStart: '14:05', timeEnd: '15:15', desc: '頂級壽喜燒', status: 'active', expenses: [], jp_name: '三嶋亭 本店', aiData: { category: 'activity', theme: 'orange', summary: { header: '午餐方案 A', primary_info: '三嶋亭 本店/高島屋店', location_keyword: 'Mishima-tei', stay_time: '1hr 10m', one_line_tip: '記帳與定位錨點 A', tel: '075-221-0003' }, details: { title: '京都壽喜燒的頂點', content: '【美食分析】\n空間氛圍：創業於明治時期的百年老店，本店保留了古色古香的京町家建築。仲居（服務生）會在桌邊親自料理，服務細緻。\n味蕾報告：使用頂級黑毛和牛，僅用砂糖與醬油在鐵鍋中燒烤。糖在鐵鍋中焦糖化的香氣，包裹著入口即化的牛肉，油脂的甜味與醬油的鹹香完美融合，是極致的味覺享受。\n點餐攻略：午間套餐 (Lunch Course) CP 值較高，必點。', must_eat: ['頂級壽喜燒', '時令京野菜', '餐後水果'] } } },
{ id: 512, date: '08/09', type: 'food', name: '【備選】麵屋 豬一 離れ', timeStart: '14:05', timeEnd: '15:15', desc: '米其林拉麵', status: 'active', expenses: [], jp_name: '麺屋 猪一 離れ', aiData: { category: 'activity', theme: 'orange', summary: { header: '午餐方案 B', primary_info: '麵屋 豬一 離れ', location_keyword: 'Menya Inoichi Hanare', stay_time: '1hr 10m', one_line_tip: '記帳與定位錨點 B', tel: '075-285-1059' }, details: { title: '細膩優雅的魚介清湯', content: '【美食分析】\n空間氛圍：獲得米其林必比登推薦的名店。店內裝潢現代且明亮，不像傳統拉麵店的油膩感。\n味蕾報告：主打魚介系清湯醬油拉麵，湯頭清澈金黃，使用高品質的鰹魚與昆布熬製，口味細膩高雅。叉燒選用高品質豬肉，軟嫩入味。搭配的柚子皮增添了一抹清香。\n點餐攻略：出汁蕎麥麵 (拉麵)、炙燒和牛丼、燒賣。', must_eat: ['出汁拉麵 (白/黑)', '炙燒和牛丼', '自家製燒賣'] } } },
{ id: 513, date: '08/09', type: 'transport', name: '移動：午餐 ➡ 中村藤吉', timeStart: '15:15', timeEnd: '15:30', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '前往祇園四條店', secondary_info: '徒步消化' }, details: { title: '甜點時間', content: '步行前往位於祇園四條的中村藤吉。飯後散步，順便欣賞鴨川風景。' } } },
{ id: 514, date: '08/09', type: 'food', name: '中村藤吉 (祇園四條店)', timeStart: '15:30', timeEnd: '17:00', desc: '抹茶甜點', status: 'active', expenses: [], jp_name: '中村藤吉本店 祇園四条店', aiData: { category: 'activity', theme: 'orange', summary: { header: '抹茶名店', primary_info: '中村藤吉 祇園四條店', location_keyword: 'Nakamura Tokichi Gion', stay_time: '1hr 30m', one_line_tip: '必點生茶果凍', tel: '075-744-1200' }, details: { title: '宇治抹茶的代名詞', content: '【美食分析】\n空間氛圍：位於古色古香的京町家建築中，可以一邊欣賞庭園或街景，一邊享用甜點。\n味蕾報告：這裡的抹茶甜點不只是甜，更保留了抹茶特有的微苦與深邃香氣。招牌「生茶果凍 (Namacha Jelly)」口感滑嫩，搭配紅豆泥與白玉，層次豐富。抹茶冰淇淋濃郁綿密。\n點餐攻略：生茶果凍 (深翠)、抹茶百匯。', must_eat: ['生茶果凍 (深翠)', '抹茶百匯', '冷泡新茶'] } } },
{ id: 515, date: '08/09', type: 'transport', name: '移動：祇園 ➡ 八坂塔', timeStart: '17:00', timeEnd: '17:45', desc: '散步', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：45m', transport_mode: 'walk', primary_info: '沿途經過花見小路', secondary_info: '慢慢散步' }, details: { title: '東山散策', content: '沿著花見小路、建仁寺周邊慢慢散步前往八坂塔。這段路充滿了京都的古老風情，適合隨手抓拍。' } } },
{ id: 516, date: '08/09', type: 'sight', name: '八坂塔 (二寧坂視角)', timeStart: '17:45', timeEnd: '18:45', desc: '黃昏攝影', status: 'active', expenses: [], jp_name: '法観寺 (八坂の塔)', aiData: { category: 'activity', theme: 'blue', summary: { header: '經典地標', primary_info: '法觀寺 (八坂塔)', location_keyword: 'Yasaka Pagoda', stay_time: '1hr', one_line_tip: '掌握黃昏柔光時刻', photo_guide: '二寧坂經典角度', tel: '075-551-2417' }, details: { title: '東山的黃昏地標', content: '京都最經典的攝影角度之一。在黃昏時刻 (Magic Hour)，夕陽的餘暉灑在五重塔和古老的木造建築上，充滿了濃厚的古都風情。建議在二寧坂尋找最佳構圖，避開過多的人潮。這座塔是東山的象徵，也是京都最美麗的剪影。', history: '相傳由聖德太子創建，是京都最古老的塔之一。現存建築為室町時代重建。', photo_advice: '站在二寧坂的坡道上，利用長焦鏡頭壓縮前景的町家建築與後方的八坂塔。等待一名穿著和服的路人經過，畫面會更有故事感。', must_list: ['必拍：二寧坂經典角度', '必看：塔身細節', '體驗：黃昏氛圍'] } } },
{ id: 517, date: '08/09', type: 'transport', name: '移動：八坂塔 ➡ 晚餐', timeStart: '18:45', timeEnd: '19:00', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '返回祇園方向', secondary_info: '下坡路段' }, details: { title: '前往晚餐', content: '沿著下坡路段走回祇園方向。傍晚的街道燈籠亮起，別有一番風味。' } } },
{ id: 518, date: '08/09', type: 'food', name: '晚餐：祇園周邊', timeStart: '19:00', timeEnd: '20:00', desc: '正式晚餐', status: 'active', expenses: [], jp_name: '祇園エリア', aiData: { category: 'activity', theme: 'orange', summary: { header: '晚餐', primary_info: '祇園周邊餐廳', location_keyword: 'Gion Dinner', stay_time: '1hr', one_line_tip: '選擇居酒屋或京料理', tel: 'N/A' }, details: { title: '祇園的夜間饗宴', content: '在熱鬧的祇園地區享用晚餐。這裡匯集了從高級懷石料理到大眾居酒屋的各種選擇。可以選擇一家提供「御番菜 (Obanzai)」的居酒屋，品嚐京都的家常美味。', must_eat: ['京野菜料理', '鯖魚壽司', '湯豆腐'] } } },
{ id: 519, date: '08/09', type: 'transport', name: '移動：祇園 ➡ 先斗町', timeStart: '20:00', timeEnd: '20:15', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '跨過四條大橋', secondary_info: '前往鴨川旁' }, details: { title: '跨越鴨川', content: '步行跨過四條大橋，欣賞鴨川的夜景。對岸就是著名的先斗町花街。' } } },
{ id: 520, date: '08/09', type: 'sight', name: '先斗町 (窄巷燈籠)', timeStart: '20:15', timeEnd: '21:15', desc: '夜景攝影', status: 'active', expenses: [], jp_name: '先斗町', aiData: { category: 'activity', theme: 'blue', summary: { header: '花街夜拍', primary_info: '先斗町通', location_keyword: 'Pontocho', stay_time: '1hr', one_line_tip: '長焦壓縮窄巷感', photo_guide: '燈籠與石板路', tel: 'N/A' }, details: { title: '花街的夜色', content: '京都五花街之一。狹窄的石板路兩旁掛滿了千鳥圖案的燈籠，充滿了神秘與傳統的氛圍。兩側是各式各樣的餐廳與料亭，運氣好的話還能看到藝妓或舞妓的身影。這裡是拍攝京都夜景氛圍的最佳地點。', history: '自江戶時代起就是繁華的花街，保留了大量的京町家建築。', photo_advice: '使用大光圈定焦鏡或長焦鏡頭，壓縮狹窄巷弄的空間感。聚焦在燈籠的光影與石板路的反光。', must_list: ['必拍：千鳥燈籠', '必拍：石板小徑', '體驗：納涼床(夏季)'] } } },
{ id: 521, date: '08/09', type: 'transport', name: '移動：先斗町 ➡ 飯店', timeStart: '21:15', timeEnd: '21:45', desc: '地鐵/步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'public', primary_info: '返回京都站', secondary_info: '結束美好的一天' }, details: { title: '歸途', content: '從河原町搭乘巴士或地鐵返回京都車站。這是今天最後的移動，可以放鬆心情。' } } },
{ id: 522, date: '08/09', type: 'sight', name: '住宿：相鐵弗雷薩', timeStart: '21:45', timeEnd: '22:15', desc: '休息', status: 'active', expenses: [], jp_name: '相鉄フレッサイン 京都駅八条口', aiData: { category: 'hub', theme: 'hub', summary: { header: '本日終點', primary_info: '京都八條口相鐵弗雷薩', location_keyword: 'Sotetsu Fresa Inn Kyoto-Hachijoguchi', stay_time: 'Overnight', one_line_tip: '休息', tel: '075-284-0203' }, details: { title: '旅程的終點', content: '回到飯店領取早上寄放的行李。整理照片，回味今天從琉璃光院的綠意到先斗町的燈火，以及那令人難忘的壽喜燒與抹茶甜點。這是一次完美的京都一日遊。晚安。' } } },


// --- Day 6: 2026/08/10 (工藝之里：越前和紙與刀具) ---
{ id: 600, date: '08/10', type: 'sight', name: '京都站 (始發)', timeStart: '07:00', timeEnd: '07:05', desc: '特急雷鳥號', status: 'active', expenses: [], jp_name: '京都駅', aiData: { category: 'hub', theme: 'hub', summary: { header: '移動日開始', primary_info: '京都站 0 號月台', location_keyword: 'Kyoto Station', stay_time: '5m', one_line_tip: '搭乘 Thunderbird 特急', tel: '0570-00-2486' }, details: { title: '往北陸的序章', content: '早安，京都。在晨曦尚未完全喚醒古都之時，我們將踏上前往北陸的旅程。前往 0 號月台，那裡停靠著將帶我們穿越湖西線的特急 Thunderbird（雷鳥號）。這不僅僅是一段移動，更是從關西的優雅轉換到北陸職人硬派美學的過渡儀式。隨著列車啟動，請留意右側車窗，琵琶湖的晨色將是送給旅人的第一份禮物。', history: '雷鳥號列車名稱源自立山連峰的神鳥「雷鳥」，象徵著連結關西與北陸的快速與優雅，自國鐵時代以來便是北陸的大動脈。', photographer_advice: '若天氣晴朗，列車行駛於湖西線高架路段時，是拍攝琵琶湖晨光的絕佳時機。建議準備好相機，隨時捕捉湖面波光。', tour_guide_advice: '建議在上車前於京都站購買「志津屋 (SIZUYA)」的招牌炸牛排三明治 (Karnet)，那種簡單卻深邃的滋味是京都人共同的早餐記憶。', must_list: ['必吃：志津屋炸牛排三明治', '必買：伊右衛門京都限定茶', '重點：確認0號月台'] } } },
{ id: 601, date: '08/10', type: 'transport', name: '移動：京都 ➡ 敦賀', timeStart: '07:05', timeEnd: '07:54', desc: '特急 Thunderbird', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：50m', transport_mode: 'public', primary_info: 'Thunderbird 3號', secondary_info: '前往敦賀轉乘' } } },
{ id: 602, date: '08/10', type: 'sight', name: '敦賀站 (轉乘)', timeStart: '07:54', timeEnd: '08:08', desc: '福井幸福鐵道', status: 'active', expenses: [], jp_name: '敦賀駅', aiData: { category: 'hub', theme: 'hub', summary: { header: '轉乘樞紐', primary_info: '敦賀站轉乘', location_keyword: 'Tsuruga Station', stay_time: '14m', one_line_tip: '跟隨地標換乘新幹線', tel: '0570-00-2486' }, details: { title: '北陸新門戶', content: '敦賀站，這座嶄新的巨大車站，標誌著北陸新幹線延伸段的開通。高挑的木質天花板設計靈感來自北前船的船帆，象徵著這裡自古以來作為港口城市的繁榮。轉乘過程雖然只有短短十多分鐘，但這是一次從「傳統特急」到「現代新幹線」的時空跳躍。', photographer_advice: '車站內的木造結構與現代玻璃帷幕形成強烈對比，利用廣角鏡頭拍攝天花板的線條，能展現出建築的幾何美感。', tour_guide_advice: '轉乘動線設計得非常直觀，地板上有巨大的顏色引導線。請務必跟隨「新幹線」的指示，從下層特急月台迅速移動至上層。', must_list: ['重點：跟隨地板顏色指示', '重點：轉乘不需出站', '必看：車站木質穹頂'] } } },
{ id: 603, date: '08/10', type: 'transport', name: '移動：敦賀 ➡ 福井', timeStart: '08:08', timeEnd: '08:45', desc: '福井幸福鐵道', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：37m', transport_mode: 'public', primary_info: '福井幸福鐵道', secondary_info: '前往福井' } } },
{ id: 604, date: '08/10', type: 'sight', name: '福井站 (恐龍廣場)', timeStart: '08:45', timeEnd: '08:50', desc: '西口恐龍像', status: 'active', expenses: [], jp_name: '福井駅', aiData: { category: 'hub', theme: 'hub', summary: { header: '抵達福井', primary_info: '福井站西口', location_keyword: 'Fukui Station', stay_time: '5m', one_line_tip: '西口有會動的恐龍像', tel: '0776-20-5367' }, details: { title: '侏羅紀世界的入口', content: '歡迎來到恐龍王國！一踏出福井站西口，巨大的暴龍機械模型正在對你咆哮，牆面上還有立體的恐龍破牆而出。這不是主題樂園，而是福井縣對其挖掘出大量恐龍化石的驕傲展示。整個廣場充滿了超現實的趣味感，彷彿時空錯置，讓人瞬間忘記旅途的疲憊。', photographer_advice: '使用超廣角鏡頭，採取極低角度仰拍暴龍，並將車站現代化的玻璃帷幕納入背景，可以創造出「恐龍入侵現代都市」的視覺衝擊感。', tour_guide_advice: '別忘了坐在「恐龍博士長椅」上與穿著白袍的恐龍博士合照，這是福井最經典的打卡方式。', must_list: ['必拍：會動的暴龍', '必拍：恐龍博士長椅', '必看：車站壁畫'] } } },
{ id: 605, date: '08/10', type: 'transport', name: '移動：車站 ➡ 飯店', timeStart: '08:50', timeEnd: '09:00', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'walk', primary_info: '前往東橫INN', secondary_info: '寄放行李' } } },
{ id: 606, date: '08/10', type: 'sight', name: '後勤：飯店寄放行李', timeStart: '09:00', timeEnd: '09:15', desc: '東橫INN 福井站前', status: 'active', expenses: [], jp_name: '東横INN福井駅前', aiData: { category: 'logistics', theme: 'rose', summary: { primary_info: '東橫INN 福井站前', location_keyword: 'Toyoko Inn Fukui Ekimae', stay_time: '15m', one_line_tip: '僅寄放行李', tel: '0776-26-1045' }, details: { title: '輕裝上陣的智慧', content: '在展開越前工藝的深度探索之前，先將沈重的行李卸下是明智之舉。東橫INN作為我們今晚的基地，提供了便捷的寄放服務。利用這短短的十多分鐘，調整隨身裝備，只帶上相機、錢包與對工藝的好奇心，讓接下來的自駕旅程更加輕盈自在。', tour_guide_advice: '寄放行李時，建議順便詢問櫃台關於今晚停車的安排（是否需要預約機械車位？），這能省去晚上回來時的溝通時間。', must_list: ['重點：寄放行李', '重點：確認停車位', '必備：護照隨身'] } } },
{ id: 607, date: '08/10', type: 'transport', name: '移動：飯店 ➡ Orix', timeStart: '09:15', timeEnd: '09:20', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：5m', transport_mode: 'walk', primary_info: '前往租車店', secondary_info: '車站東口方向' } } },
{ id: 608, date: '08/10', type: 'sight', name: '租車：Orix 取車', timeStart: '09:20', timeEnd: '09:30', desc: '福井站前店', status: 'active', expenses: [], jp_name: 'オリックスレンタカー', aiData: { category: 'logistics', theme: 'rose', summary: { primary_info: 'Orix 福井駅前店', location_keyword: 'Orix Rent-A-Car Fukui', stay_time: '10m', one_line_tip: '檢查車況、設定導航', tel: '0776-24-0019' }, details: { title: '掌握方向盤的自由', content: '越前市的工藝聚落分散，自駕是探索這片土地的最佳方式。在 Orix 辦理取車手續時，請將心態切換為「探險模式」。今天我們將深入那些大眾交通難以觸及的職人秘境。確認車輛狀況後，輸入第一站 MapCode，隨著引擎發動，越前職人之旅正式啟程。', tour_guide_advice: '務必確認 ETC 卡是否已正確插入主機。設定導航時，建議將音量調大，因為日本導航在路口前的提示通常較為頻繁。', must_list: ['重點：檢查外觀刮痕', '必備：ETC卡', '重點：設定第一站導航'] } } },
{ id: 609, date: '08/10', type: 'transport', name: '移動：福井 ➡ 岡太神社', timeStart: '09:30', timeEnd: '10:15', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：45m', transport_mode: 'car', primary_info: '前往越前市', secondary_info: '約 25 公里' } } },
{ id: 610, date: '08/10', type: 'sight', name: '岡太神社・大瀧神社', timeStart: '10:15', timeEnd: '11:15', desc: '紙之神', status: 'active', expenses: [], jp_name: '岡太神社・大瀧神社', aiData: { category: 'activity', theme: 'blue', summary: { primary_info: '岡太神社・大瀧神社', location_keyword: 'Okamoto Shrine', stay_time: '1hr', one_line_tip: '拍攝複雜的屋頂結構', photo_guide: '使用廣角與長焦特寫屋頂', tel: '0778-42-1151' }, details: { title: '獻給紙神的建築奇蹟', content: '隱身在深山巨木之中的岡太神社，是全日本唯一供奉「紙神」川上御前的地方。當你第一眼看到下宮的拜殿時，絕對會被那層層堆疊、如波浪般翻湧的檜皮葺屋頂所震懾。這不僅是建築，更是越前和紙職人對神明最崇高的敬意展現。複雜的斗拱與精細的獅子、龍木雕，在寂靜的森林中訴說著千年的信仰。', history: '傳說1500年前，一位美麗的女神在岡太川上游傳授了造紙技術給村民，從此越前和紙便聞名遐邇。這座神社便是為了感念那位女神而建。', photographer_advice: '屋頂的曲線是拍攝靈魂。建議使用長焦鏡頭（70-200mm）進行「壓縮」，特寫那繁複的屋頂結構與木雕細節。同時，利用廣角鏡頭帶入周圍參天的古杉，能展現出神域的空靈與莊嚴。', tour_guide_advice: '這裡遊客稀少，極度寧靜。參拜後，請務必繞到本殿後方，欣賞那令人驚嘆的建築懸山結構。', must_list: ['必看：檜皮葺波浪屋頂', '必看：本殿木雕', '體驗：森林浴'] } } },
{ id: 611, date: '08/10', type: 'transport', name: '移動：神社 ➡ 和紙之里', timeStart: '11:15', timeEnd: '11:20', desc: '短程移動', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：5m', transport_mode: 'car', primary_info: '前往越前和紙之里', secondary_info: '極短車程' } } },
{ id: 612, date: '08/10', type: 'sight', name: '越前和紙之里', timeStart: '11:20', timeEnd: '12:30', desc: '傳統工藝', status: 'active', expenses: [], jp_name: '越前和紙の里', aiData: { category: 'activity', theme: 'blue', summary: { primary_info: '越前和紙之里 (卯立工藝館)', location_keyword: 'Echizen Washi Village', stay_time: '1hr 10m', one_line_tip: '體驗手抄和紙', photo_guide: '拍攝職人手部動作', tel: '0778-43-7800' }, details: { title: '指尖上的千年溫度', content: '走進卯立工藝館（Udatsu Paper & Craft Museum），空氣中彌漫著紙漿與水的獨特氣味。這裡保存了傳統的越前和紙製作工法。看著職人有節奏地在水中搖動竹簾（流し漉き），那專注的神情與水流的聲音，彷彿時間靜止。越前和紙以其強韌與優美著稱，甚至被用於日本的紙幣製作。親手觸摸那些剛做好的和紙，你會感受到機器無法取代的溫度。', photographer_advice: '職人抄紙的瞬間是絕佳的攝影題材。將焦點對準職人的手部與飛濺的水珠，使用稍快的快門凝結水流的動態感，或利用窗邊的自然光拍攝透光的和紙紋理。', tour_guide_advice: '強烈推薦參加「手抄和紙體驗」（約1500日圓）。只要20分鐘，你就能親手製作出帶有押花或金箔的專屬和紙明信片，這是此行最珍貴的紀念品。', must_list: ['體驗：手抄和紙DIY', '必買：和紙信紙組', '必看：職人流漉技法'] } } },
{ id: 613, date: '08/10', type: 'transport', name: '移動：和紙之里 ➡ 生蕎庵', timeStart: '12:30', timeEnd: '12:50', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：20m', transport_mode: 'car', primary_info: '前往午餐地點', secondary_info: '越前市區' } } },
{ id: 614, date: '08/10', type: 'food', name: '生蕎庵 (Kibuan)', timeStart: '12:50', timeEnd: '14:00', desc: '越前蘿蔔泥蕎麥麵', status: 'active', expenses: [], jp_name: '生蕎庵', aiData: { category: 'activity', theme: 'orange', summary: { primary_info: '生蕎庵', location_keyword: '生蕎庵', stay_time: '1hr 10m', one_line_tip: '必點越前蘿蔔泥蕎麥麵', tel: '0778-42-0589' }, details: { title: '辛辣與清香的直球對決', content: '來到福井，如果沒吃過「越前蘿蔔泥蕎麥麵 (Echizen Oroshi Soba)」，就不算來過。「生蕎庵」是當地人私藏的名店，這裡的蕎麥麵使用石臼研磨的福井縣產蕎麥粉，香氣濃郁逼人。與一般沾麵不同，這裡是將辛辣的蘿蔔泥高湯直接淋在冷麵上。第一口，蘿蔔的辛辣直衝腦門，緊接著是蕎麥的甘甜與柴魚的鮮香，那種爽快感在炎炎夏日簡直是救贖。', tour_guide_advice: '除了招牌的蘿蔔泥蕎麥麵，建議加點一份「炸天婦羅」。這裡的天婦羅麵衣輕薄酥脆，沾著蘿蔔泥高湯一起吃，油膩感全消，是完美的味覺平衡。', must_list: ['必吃：蘿蔔泥蕎麥麵', '必吃：炸天婦羅', '重點：最後喝蕎麥湯'] } } },
{ id: 615, date: '08/10', type: 'transport', name: '移動：餐廳 ➡ 刀具村', timeStart: '14:00', timeEnd: '14:20', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：20m', transport_mode: 'car', primary_info: '前往武生刀具村', secondary_info: '工業區' } } },
{ id: 616, date: '08/10', type: 'sight', name: '武生刀具村', timeStart: '14:20', timeEnd: '15:20', desc: '越前打刃物', status: 'active', expenses: [], jp_name: 'タケフナイフビレッジ', aiData: { category: 'activity', theme: 'blue', summary: { primary_info: 'Takefu Knife Village', location_keyword: 'Takefu Knife Village', stay_time: '1hr', one_line_tip: '參觀共同工房', photo_guide: '火花與金屬質感', tel: '0778-27-7120' }, details: { title: '火花中鍛造的鋼鐵靈魂', content: '遠遠就能看到這座造型前衛的建築，武生刀具村是集結了多家「越前打刃物」職人的共同工房。這裡沒有玻璃櫥窗的隔閡，你可以站在二樓的迴廊，直接俯瞰下方火花四濺的鍛造現場。機械鎚的撞擊聲、磨刀的滋滋聲、以及空氣中瀰漫的鐵鏽味，構成了最真實的工業交響曲。這裡傳承了700年的鍛造技術，每一把刀都是職人汗水的結晶。', history: '越前打刃物的歷史可追溯至1337年，當時京都的刀匠千代鶴國安為了尋找適合鍛刀的水而來到此地，將製刀技術傳授給當地農民。', photographer_advice: '這裡的光線通常充滿戲劇性。將鏡頭對準正在打鐵的職人，使用較慢的快門（如 1/15秒）可以拍出火花飛濺的軌跡線條，展現動感；或使用高速快門凝結火花，展現力量感。黑白模式也非常適合這裡的氛圍。', must_list: ['必看：職人鍛造現場', '必買：職人手作廚刀', '必看：刀具博物館'] } } },
{ id: 617, date: '08/10', type: 'transport', name: '移動：刀具村 ➡ 龍泉刃物', timeStart: '15:20', timeEnd: '15:23', desc: '超短程', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：3m', transport_mode: 'car', primary_info: '就在附近', secondary_info: '車程 1 公里' } } },
{ id: 618, date: '08/10', type: 'sight', name: '龍泉刃物 (Ryusen)', timeStart: '15:23', timeEnd: '16:23', desc: '頂級廚刀', status: 'active', expenses: [], jp_name: '龍泉刃物', aiData: { category: 'activity', theme: 'blue', summary: { primary_info: '龍泉刃物 ファクトリー&ストア', location_keyword: ' 龍泉刃物 ', stay_time: '1hr', one_line_tip: '欣賞大馬士革鋼紋路', tel: '0778-43-6020' }, details: { title: '餐桌上的藝術品', content: '如果說武生刀具村是粗獷的鍛造現場，那麼龍泉刃物就是精緻的藝術殿堂。這裡生產的牛排刀，是法國米其林三星餐廳的指定餐具，甚至需要排隊數年才能入手。走進直營店，你會被刀刃上那如流水般的大馬士革鋼紋路（龍泉輪）所迷住。那不僅是鋒利的工具，更是結合了實用與美學的工藝極致。握在手中，那種完美的配重與手感，會讓人感動。', photographer_advice: '這裏適合進行「微距攝影」。將鏡頭貼近刀刃，捕捉大馬士革鋼那獨特的層疊紋理。店內的燈光設計精良，利用反光可以拍出金屬的高級質感。', tour_guide_advice: '店內有時會提供試切體驗（視當日狀況），請務必嘗試切切看，你會驚訝於那種「毫無阻力」的切斷感。這裡的拆信刀或指甲剪是相對好入手的入門精品。', must_list: ['必看：大馬士革鋼紋', '必買：SK01 牛排刀', '必買：精緻拆信刀'] } } },
{ id: 619, date: '08/10', type: 'transport', name: '移動：越前 ➡ 福井市', timeStart: '16:23', timeEnd: '17:20', desc: '自駕返回', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：55m', transport_mode: 'car', primary_info: '返回福井市區', secondary_info: '傍晚車流可能較多' } } },
{ id: 620, date: '08/10', type: 'sight', name: '後勤：車輛停放', timeStart: '17:20', timeEnd: '17:30', desc: '停回飯店/停車場', status: 'active', expenses: [], jp_name: '駐車場', aiData: { category: 'logistics', theme: 'rose', summary: { primary_info: '飯店/周邊停車場', location_keyword: 'Fukui Station Parking', stay_time: '10m', one_line_tip: '停好車，步行去晚餐', tel: 'N/A' }, details: { title: '暫別方向盤', content: '結束了充實的越前工藝之旅，我們回到了福井市區。現在是時候讓愛車休息了。請將車輛停放在飯店停車場或周邊的收費停車場。接下來的行程——養浩館的靜謐與秋吉的熱鬧，都在步行可達的範圍內。放下鑰匙，準備用雙腳和味蕾去感受福井的夜晚吧。', tour_guide_advice: '停好車後，請務必帶上相機包，並確認車門已鎖好。把停車券收好，有些飯店櫃檯需要過卡。', must_list: ['重點：妥善停車', '重點：攜帶隨身貴重物', '重點：停車券保管'] } } },
{ id: 621, date: '08/10', type: 'transport', name: '移動：停車場 ➡ 養浩館', timeStart: '17:30', timeEnd: '17:35', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：5m', transport_mode: 'walk', primary_info: '前往養浩館庭園', secondary_info: '步行前往' } } },
{ id: 622, date: '08/10', type: 'sight', name: '養浩館庭園', timeStart: '17:35', timeEnd: '18:35', desc: '大名庭園', status: 'active', expenses: [], jp_name: '養浩館庭園', aiData: { category: 'activity', theme: 'blue', summary: { primary_info: '養浩館庭園', location_keyword: 'Yokokan Garden', stay_time: '1hr', one_line_tip: '拍攝黃昏池面倒影', photo_guide: '從屋內往外拍', tel: '0776-21-0489' }, details: { title: '漂浮在水上的江戶夢境', content: '養浩館庭園是前福井藩主松平家的別邸，它最大的特色在於建築物彷彿直接「漂浮」在巨大的池塘之上。與京都庭園的封閉感不同，這裡充滿了開放與寬闊的氣息。脫下鞋子，走進數寄屋造的建築內部，坐在榻榻米上望向庭園，水面幾乎與視線齊平。黃昏時分，夕陽的餘暉灑在水面上，庭園的倒影與真實世界交融，寧靜得讓人屏息。', history: '這裡曾是藩主的休養所，被美國著名的庭園雜誌連續多年評選為日本庭園的前幾名，其實力不輸給兼六園，卻擁有難得的清幽。', photographer_advice: 'Blue Hour（日落後的藍調時刻）是這裡的魔幻時刻。建議從建築物內部往外拍攝，利用窗框作為天然的畫框，將亮燈的石燈籠與水面倒影一同納入構圖，可以拍出極具禪意的對稱畫面。', must_list: ['必拍：御月見之間倒影', '體驗：緣側靜坐', '必看：數寄屋建築'] } } },
{ id: 623, date: '08/10', type: 'transport', name: '移動：養浩館 ➡ 秋吉', timeStart: '18:35', timeEnd: '18:45', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'walk', primary_info: '前往秋吉串燒', secondary_info: '步行前往' } } },
{ id: 624, date: '08/10', type: 'food', name: '秋吉 (福井駅前店)', timeStart: '18:45', timeEnd: '20:15', desc: '福井靈魂美食', status: 'active', expenses: [], jp_name: 'やきとりの名門 秋吉', aiData: { category: 'activity', theme: 'orange', summary: { primary_info: '秋吉 福井駅前店', location_keyword: 'Yakitori no Meimon Akiyoshi', stay_time: '1.5hr', one_line_tip: '必點純雞 (Junkei)', tel: '+0776-21-3572' }, details: { title: '社長，歡迎回來！', content: '在福井，如果你問當地人要去哪裡聚餐，十個人有九個會說「秋吉」。一進店門，店員精神抖擻地喊著「社長，歡迎回來！」，瞬間就會被這股熱情的氣氛感染。這裡的特色是串燒非常小巧，且以「5串」為單位點餐。大家圍坐在櫃檯前，看著師傅在炭火上熟練地翻轉雞肉，將烤好的串燒放在你面前的保溫鐵板上。這不僅是晚餐，更是融入福井庶民文化的最佳體驗。', tour_guide_advice: '必點招牌是「純雞 (Junkei)」，使用的是嚴選的母雞肉，口感極具嚼勁且肉汁豐富，是其他地方吃不到的美味。別忘了點特製的蒜味沾醬，搭配生啤酒簡直絕配。', must_list: ['必吃：純雞 (5串)', '必吃：雞皮 (Shiro)', '必吃：炸串 (Kushi-katsu)'] } } },
{ id: 625, date: '08/10', type: 'transport', name: '移動：秋吉 ➡ 飯店', timeStart: '20:15', timeEnd: '20:20', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：5m', transport_mode: 'walk', primary_info: '返回東橫INN', secondary_info: '步行回飯店' } } },
{ id: 626, date: '08/10', type: 'sight', name: '住宿：東橫INN', timeStart: '20:20', timeEnd: '23:59', desc: '休息', status: 'active', expenses: [], jp_name: '東横INN福井駅前', aiData: { category: 'hub', theme: 'hub', summary: { primary_info: '東横INN福井車站前', location_keyword: 'Toyoko Inn Fukui Ekimae', stay_time: 'Overnight', one_line_tip: '領取行李、休息', tel: '0776-26-1045' }, details: { title: '明日的特種兵整備', content: '帶著滿身的烤肉香氣與微醺的滿足感回到飯店。領取早上寄放的行李，辦理入住。今晚的休息至關重要，因為明天凌晨四點我們就要出發去追逐天空之城的日出。請務必將所有相機電池充飽電，整理好今天的和紙與刀具戰利品，並設定好鬧鐘。福井的夜，晚安。', must_list: ['重點：相機充電', '重點：設定04:00鬧鐘', '重點：整理戰利品'] } } },


// --- Day 7: 2026/08/11 (越前大野晨光與三國花火) ---
{ id: 700, date: '08/11', type: 'sight', name: '起點：凌晨出發', timeStart: '04:00', timeEnd: '04:00', desc: '早起出發', status: 'active', expenses: [], jp_name: '東横INN福井駅前', aiData: { category: 'hub', theme: 'hub', summary: { header: '特種兵行程開始', primary_info: '東橫INN 福井站前', location_keyword: 'Toyoko Inn Fukui Ekimae', stay_time: '0m', one_line_tip: '攜帶手電筒與防寒衣物', tel: '+81-776-26-1045' }, details: { title: '星夜中的出征', content: '凌晨 04:00，城市還在沉睡，我們已經整裝待發。這是一場與太陽的賽跑。今天的目標是越前大野城，被稱為「北陸的天空之城」。雖然身體可能還殘留著睡意，但想到即將見證的景色，腎上腺素已經開始分泌。請務必再次檢查：手電筒帶了嗎？防寒衣物穿了嗎？相機記憶卡清空了嗎？出發吧，去追逐第一道晨光。', must_list: ['必備：手電筒/頭燈', '必備：防寒薄外套', '重點：準時出發'] } } },
{ id: 701, date: '08/11', type: 'transport', name: '移動：飯店 ➡ 越前大野', timeStart: '04:00', timeEnd: '04:50', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：50m', transport_mode: 'car', primary_info: '導航：天空之城展望台停車場', secondary_info: '夜間山路小心' } } },
{ id: 702, date: '08/11', type: 'transport', name: '移動：登山 ➡ 展望台', timeStart: '04:50', timeEnd: '05:10', desc: '徒步登山', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：20m', transport_mode: 'walk', primary_info: '徒步上山', secondary_info: '需手電筒' }, details: { title: '黎明前的攀登', content: '停好車後，迎接我們的是一段約 20 分鐘的登山步道。四周漆黑一片，只有腳下的手電筒光圈指引方向。空氣冷冽而清新，樹林間偶爾傳來鳥鳴。這是一段與自己對話的時間，隨著高度攀升，視野逐漸開闊，遠方大野市的街燈如同地上的星河，預告著我們即將抵達最佳觀測點。' } } },
{ id: 703, date: '08/11', type: 'scouting', name: '攝影：越前大野城', timeStart: '05:10', timeEnd: '06:30', desc: '天空之城', status: 'active', expenses: [], jp_name: '越前大野城', aiData: { category: 'scouting', theme: 'dark', summary: { primary_info: '天空之城展望台', location_keyword: 'Echizen Ono Castle Observation Deck', stay_time: '1hr 20m', one_line_tip: '夏季雲海機率低，主攻晨光', photo_guide: '長焦特寫城堡', tel: '+81-779-66-0234' }, details: { title: '漂浮於晨光中的幻影', content: '站在戌山城址的展望台上，屏息以待。雖然 8 月盛夏要見到典型的「雲海」需要極佳的運氣（通常發生在秋冬溫差大時），但此刻的景色依然令人動容。遠方的龜山頂上，越前大野城孤傲地矗立著。當第一道曙光翻越山稜，金色的光線瞬間點亮天守閣，那一刻，城堡彷彿漂浮在光與薄霧交織的虛幻之海中。這是攝影師夢寐以求的「Magic Hour」。', history: '這座城堡由織田信長的部將金森長近於 1576 年建造，其城下町棋盤狀的佈局至今仍保留著「小京都」的風貌。', photographer_advice: '長焦鏡頭（200mm-400mm）是這裡的決勝關鍵。利用長焦壓縮空間，將背景的山脈與前景的城堡拉近，營造出孤絕的氣勢。若沒有雲海，則專注於捕捉晨光在城堡牆面上的色溫變化。', must_list: ['必備：長焦鏡頭', '必備：穩固腳架', '體驗：晨間咖啡'] } } },
{ id: 704, date: '08/11', type: 'transport', name: '移動：展望台 ➡ 飯店', timeStart: '06:30', timeEnd: '07:30', desc: '自駕返回', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr', transport_mode: 'car', primary_info: '返回福井市區', secondary_info: '準備補眠' } } },
{ id: 705, date: '08/11', type: 'sight', name: '休息：飯店補眠', timeStart: '07:30', timeEnd: '11:00', desc: '盥洗與早餐', status: 'active', expenses: [], jp_name: '東横INN福井駅前', aiData: { category: 'hub', theme: 'hub', summary: { header: '體力回充', primary_info: '東橫INN 福井站前', location_keyword: 'Toyoko Inn Fukui Ekimae', stay_time: '3.5hr', one_line_tip: '享用早餐、補眠', tel: '+81-776-26-1045' }, details: { title: '戰略性休整', content: '結束了清晨的特種兵任務，現在我們回到了舒適的現代文明。這 3.5 小時的空檔不是浪費，而是為了下午更艱鉅的「花火大會」所做的戰略性儲備。享用飯店的熱騰騰早餐，洗去登山的汗水，拉上窗簾補個回籠覺。在長途旅行中，懂得「休息」的旅人才能走得更遠。', must_list: ['重點：洗熱水澡', '重點：手機充電', '重點：補眠'] } } },
{ id: 706, date: '08/11', type: 'transport', name: '移動：飯店 ➡ 歐洲軒', timeStart: '11:00', timeEnd: '11:10', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'car', primary_info: '前往歐洲軒總本店', secondary_info: '市區短程' } } },
{ id: 707, date: '08/11', type: 'food', name: '午餐：歐洲軒 總本店', timeStart: '11:10', timeEnd: '12:30', desc: '醬汁豬排丼', status: 'active', expenses: [], jp_name: 'ヨーロッパ軒 総本店', aiData: { category: 'activity', theme: 'orange', summary: { primary_info: 'ヨーロッパ軒 総本店', location_keyword: 'Europe-ken Sohonten', stay_time: '1hr 20m', one_line_tip: '內行吃法：不加蛋', tel: '+81-776-21-4681' }, details: { title: '百年傳承的醬汁魔力', content: '來到福井，怎能不朝聖「歐洲軒」總本店？這裡是福井名物「醬汁豬排丼 (Sauce Katsudon)」的發源地。創業於1913年，其秘製的烏斯特醬汁是整碗飯的靈魂。與一般淋蛋液的豬排丼不同，這裡的豬排是薄切後沾裹細麵包粉油炸，再浸泡在酸甜的醬汁中，鋪在淋了醬的白飯上。簡單、粗暴，卻美味得讓人停不下來。', tour_guide_advice: '內行人的點法是「不加蛋」。雖然也有混合蛋液的選項，但最經典的吃法就是享受那酥脆麵衣吸滿醬汁後的獨特口感。店內常常大排長龍，建議一開店就進去。', must_list: ['必吃：醬汁豬排丼', '必吃：炸牡蠣(季節限定)', '必買：特製醬汁伴手禮'] } } },
{ id: 708, date: '08/11', type: 'transport', name: '移動：福井 ➡ 東尋坊', timeStart: '12:30', timeEnd: '13:30', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr', transport_mode: 'car', primary_info: '前往東尋坊', secondary_info: '往海邊移動' } } },
{ id: 709, date: '08/11', type: 'sight', name: '東尋坊 (Tojinbo)', timeStart: '13:30', timeEnd: '16:30', desc: '柱狀節理斷崖', status: 'active', expenses: [], jp_name: '東尋坊', aiData: { category: 'activity', theme: 'blue', summary: { primary_info: '東尋坊', location_keyword: 'Tojinbo Cliffs', stay_time: '3hr', one_line_tip: '光線強烈，注意防曬', photo_guide: '使用CPL濾鏡消除反光', tel: '+81-776-82-5515' }, details: { title: '被巨浪雕刻的幾何學', content: '站在東尋坊的懸崖邊，腳下是高達 25 公尺的峭壁，眼前是波濤洶湧的日本海。這裡擁有世界少見的大規模「輝石安山岩柱狀節理」，被列為國家天然紀念物。這些五角形或六角形的岩柱，彷彿是大自然用巨大的鑿子刻出來的幾何藝術品。午後的陽光強烈，海風帶著鹹味，海浪拍打岩壁的轟鳴聲震撼人心。', history: '傳說這裡曾有一位名為「東尋坊」的惡僧，因作惡多端被村民推下懸崖，從此這裡便波濤洶湧，因而得名。', photographer_advice: '下午 13:30-16:30 光線非常硬，海面反光強烈。強烈建議使用 CPL 偏光鏡，不僅能消除海面反光，還能讓藍天與岩石的對比更加鮮明。若想拍出壯闊感，建議搭乘觀光船從海面上仰拍。', tour_guide_advice: '夏天這裡非常炎熱。拍完照後，務必躲進商店街，買一支當地特色的「墨魚汁霜淇淋」消暑，黑色的外觀非常吸睛！', must_list: ['必拍：大池斷崖', '必備：CPL濾鏡', '必吃：墨魚汁霜淇淋'] } } },
{ id: 710, date: '08/11', type: 'transport', name: '移動：東尋坊 ➡ 花火會場', timeStart: '16:30', timeEnd: '17:30', desc: '前往停車場', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr', transport_mode: 'car', primary_info: '前往三國花火停車場', secondary_info: '預期交通管制' }, details: { title: '暴風雨前的寧靜', content: '雖然從東尋坊到三國港距離不遠，但千萬別掉以輕心。三國花火大會是北陸最大的夏季盛事，此刻周邊道路已經開始實施交通管制。我們必須在人潮完全湧入前，搶先抵達預定的停車場。這是一場關於時間與耐心的博弈，提早一分鐘，可能就決定了你今晚是優雅地看煙火，還是堵在車陣中。', tour_guide_advice: '建議事先在 Google Maps 上標記好幾個備用停車場。停好車後，請確認車內備有足夠的飲用水與零食，因為等一下可能會在車上或會場待很久。', must_list: ['重點：提早卡位', '必備：車用充電器', '必備：離線地圖'] } } },
{ id: 711, date: '08/11', type: 'scouting', name: '三國花火大會', timeStart: '17:30', timeEnd: '21:00', desc: '水中花火', status: 'active', expenses: [], jp_name: '三国花火大会', aiData: { category: 'scouting', theme: 'dark', summary: { primary_info: '三國日落海灘', location_keyword: 'Mikuni Sunset Beach', stay_time: '3.5hr', one_line_tip: '北陸最大級水中花火', photo_guide: '捕捉海面倒影', tel: '+81-776-50-3152' }, details: { title: '綻放在海面上的半圓', content: '如果說一般的花火是仰望星空，那麼三國花火就是俯瞰海洋。這是北陸最大規模的花火大會，其最大特色在於「水中花火」。花火師會乘船在行進間將煙火球直接投入海中，花火在海面上炸開成完美的半圓形，與倒映在水中的半圓結合成一個完整的圓。那一刻，天空與海洋被七彩光芒連結，伴隨著海浪聲與巨大的爆炸聲，視覺與聽覺的震撼無與倫比。', photographer_advice: '拍攝水中花火，位置決定一切。務必佔據能看到海面的低角度位置（如沙灘區）。使用 B 快門 (Bulb) 搭配快門線，光圈縮至 F8-F11，ISO 100-200。捕捉花火炸開並倒映在海面上的完整瞬間。', tour_guide_advice: '會場人潮極多，廁所大排長龍。建議在花火開始前 1 小時就解決生理需求。帶上野餐墊，吹著海風等待開演，也是一種享受。', must_list: ['必看：二尺玉水中花火', '必備：快門線/腳架', '必備：野餐墊'] } } },
{ id: 712, date: '08/11', type: 'transport', name: '移動：撤收 ➡ 爐端燒 彌吉 駅前店', timeStart: '21:00', timeEnd: '22:00', desc: '嚴重塞車', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr+', transport_mode: 'car', primary_info: '返回福井市區', secondary_info: '預期嚴重癱瘓' }, details: { title: '撤收地獄與心理戰', content: '花火結束的瞬間，也是另一場戰爭的開始——「撤收」。數萬人同時湧出會場，周邊道路將陷入完全癱瘓。光是駛出停車場可能就需要 30-60 分鐘。這時候，請拿出你的修養與耐心。車流可能一動也不動，這在大型花火大會後是常態。', tour_guide_advice: '建議在上車前先上好廁所。準備好喜歡的音樂或 Podcast，把這段塞車時間當作是與旅伴聊天、回味花火照片的時光。', must_list: ['心態：保持耐心', '對策：車上娛樂', '對策：上好廁所'] } } },
{ id: 713, date: '08/11', type: 'food', name: '爐端燒 彌吉 駅前店', timeStart: '22:00', timeEnd: '22:45', desc: '福井海鮮居酒屋', status: 'active', expenses: [], jp_name: 'ろばた焼 弥吉 駅前店', aiData: { category: 'activity', theme: 'orange', summary: { primary_info: 'ろばた焼 弥吉 駅前店', location_keyword: 'Robatayaki Yakichi Ekimae', stay_time: '45m', one_line_tip: '必點厚切鰤魚與炸蝦', tel: '0776-21-3345' }, details: { title: '福井的深夜海鮮祭', content: '經歷了花火大會的擁擠與塞車，此刻最需要的是一杯冰涼的生啤酒與豪邁的海鮮料理。彌吉是福井當地極具人氣的居酒屋，雖然是連鎖店，但海鮮鮮度卻有著驚人的水準。店內充滿了爐端燒特有的熱鬧氛圍。招牌的「厚切鰤魚刺身」油脂豐富，切片厚度驚人，入口即化的口感讓人忘卻疲憊。巨大的「炸蝦」也是這裡的名物，酥脆彈牙。', must_eat: ['ブリ (厚切り)：鰤魚/青甘 (厚切)', 'ジャンボエビフライ (二匹)：特大炸蝦 (2隻)', '弥吉揚','白エビ唐揚：炸白蝦 (富山特產)','のどぐろ塩焼：鹽烤紅喉 (黑喉)'] } } },{ id: 714, date: '08/11', type: 'transport', name: '移動：拉麵 ➡ 飯店', timeStart: '22:45', timeEnd: '23:00', desc: '短程步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '返回東橫INN', secondary_info: '結束漫長的一天' } } },
{ id: 715, date: '08/11', type: 'sight', name: '住宿：東橫INN', timeStart: '23:00', timeEnd: '23:59', desc: '休息', status: 'active', expenses: [], jp_name: '東横INN福井駅前', aiData: { category: 'hub', theme: 'hub', summary: { header: '本日終點', primary_info: '東橫INN 福井站前', location_keyword: 'Toyoko Inn Fukui Ekimae', stay_time: 'Overnight', one_line_tip: '休息', tel: '+81-776-26-1045' }, details: { title: '特種兵的安息', content: '回到飯店，雙腿可能已經痠痛，但內心卻是滿盈的。今天我們在清晨攀登了山城，在夜晚見證了海上的火花，這是一般觀光客無法體驗的「特種兵」一日。好好按摩雙腿，洗個熱水澡。明天，我們將告別福井，展開前往東北的大移動。今晚，祝你有個好夢。', must_list: ['重點：休足時間', '重點：備份照片', '重點：晚安'] } } },




// --- Day 8: 2026/08/12 (福井勝山巡禮 -> 大移動 -> 仙台) ---
{ id: 800, date: '08/12', type: 'sight', name: '後勤：退房與裝載', timeStart: '07:00', timeEnd: '07:30', desc: '整理行李上車', status: 'active', expenses: [], jp_name: '東横INN福井駅前', aiData: { category: 'hub', theme: 'hub', summary: { header: '起始錨點', primary_info: '東橫INN 福井站前', location_keyword: 'Toyoko Inn Fukui Ekimae', stay_time: '30m', one_line_tip: '行李全數上車', tel: '+81-776-26-1045' }, details: { title: '大移動日的起手式', content: '今天是旅程中移動距離最長的一天，精準的後勤管理是關鍵。辦理退房時，請再次掃描房間角落，確保沒有遺漏任何物品。因為稍後還了車就要直接上新幹線，請務必將所有行李（包含昨天的戰利品）有條理地裝上租賃車。這是一個轉換心境的時刻，我們即將從日本海側跨越到太平洋側。', tour_guide_advice: '建議將稍後在新幹線上可能需要的物品（如行動電源、外套、零食）先整理在隨身包包中，避免還車時手忙腳亂。', must_list: ['重點：行李全數上車', '重點：隨身包整理', '必備：退房收據'] } } },
{ id: 801, date: '08/12', type: 'transport', name: '移動：福井 ➡ 平泉寺', timeStart: '07:30', timeEnd: '08:00', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '前往勝山市', secondary_info: '早晨車流順暢' } } },
{ id: 802, date: '08/12', type: 'sight', name: '平泉寺白山神社', timeStart: '08:00', timeEnd: '09:15', desc: '苔蘚與杉樹林', status: 'active', expenses: [], jp_name: '平泉寺白山神社', aiData: { category: 'activity', theme: 'blue', summary: { primary_info: '平泉寺白山神社', location_keyword: 'Heisenji Hakusan Shrine', stay_time: '1hr 15m', one_line_tip: '注意蚊蟲，使用CPL濾鏡', photo_guide: '捕捉穿透杉林的光線', tel: '+81-779-88-8117' }, details: { title: '綠色寂靜的千年聖域', content: '如果說京都有苔寺，那福井就有平泉寺。踏入鳥居的那一刻，世界彷彿被按下了靜音鍵。這裡曾經是擁有數千僧兵的巨大宗教都市，如今只剩下參天古杉與覆蓋地面的厚重青苔。清晨 8 點，陽光穿透樹梢灑下「耶穌光」，斑駁的光影在翠綠的苔蘚上跳動，空氣中充滿了泥土與植物的芬芳。這是一種能洗滌心靈的綠色寂靜。', history: '這裡曾是白山信仰的中心，全盛時期勢力強大到能與織田信長抗衡，最終在戰火中燒毀，直到近代才從土層下挖掘出當年的石板路，被稱為「北陸的龐貝城」。', photographer_advice: '這裡是光影的遊樂場。強烈建議使用偏光鏡 (CPL) 消除葉面反光，讓苔蘚的綠色更飽和。尋找逆光角度，捕捉穿透杉林的神聖光束。', tour_guide_advice: '※重要提醒：這裡環境極度原始，蚊蟲非常多且兇猛。請務必噴好防蚊液或穿著長袖，否則你將無法專心感受這份寧靜。', must_list: ['必備：CPL偏光鏡', '必備：防蚊液', '必看：舊參道石板'] } } },
{ id: 803, date: '08/12', type: 'transport', name: '移動：平泉寺 ➡ 勝山城', timeStart: '09:15', timeEnd: '09:30', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '前往勝山城博物館', secondary_info: '短程移動' } } },
{ id: 804, date: '08/12', type: 'sight', name: '勝山城博物館', timeStart: '09:30', timeEnd: '10:45', desc: '日本最高天守', status: 'active', expenses: [], jp_name: '勝山城博物館', aiData: { category: 'activity', theme: 'blue', summary: { primary_info: '勝山城博物館', location_keyword: 'Katsuyama Castle Museum', stay_time: '1hr 15m', one_line_tip: '低角度廣角拍攝', photo_guide: '誇飾建築高度', tel: '+81-779-88-6200' }, details: { title: '昭和時代的鋼筋巨獸', content: '在田園風光中，一座巨大的城堡拔地而起。這就是勝山城博物館。雖然它是現代重建的鋼筋混凝土建築（非歷史古蹟），但它擁有一個驚人的頭銜——「日本最高的天守閣」，高度達 57.8 公尺，比大阪城、名古屋城都還要高。這是一座充滿昭和時代豪情與野心的建築，巨大的龍與鯱裝飾在屋簷上，展現出一種壓倒性的魄力。', photographer_advice: '正因為它高大，我們更要誇飾它的高大。使用廣角鏡頭，盡可能貼近地面進行低角度仰拍，利用透視變形讓城堡看起來直衝雲霄。藍天下的白色牆面與金色裝飾對比強烈。', tour_guide_advice: '館內收藏了豐富的大名武具與屏風，如果你是戰國迷，這裡的展品意外地豐富。登上頂樓展望台，可以360度俯瞰勝山市的盆地美景。', must_list: ['必拍：日本最高天守', '必看：龍形瓦當', '體驗：天守閣展望'] } } },
{ id: 805, date: '08/12', type: 'transport', name: '移動：勝山城 ➡ 野村屋', timeStart: '10:45', timeEnd: '11:00', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '前往午餐地點', secondary_info: '準時避開人潮' } } },
{ id: 806, date: '08/12', type: 'food', name: '福彩り食堂 のむら屋', timeStart: '11:00', timeEnd: '12:00', desc: '伏爾加飯名店', status: 'active', expenses: [], jp_name: '福彩り食堂 のむら屋', aiData: { category: 'activity', theme: 'orange', summary: { header: '必吃午餐', primary_info: '福彩り食堂 のむら屋', location_keyword: 'Nomuraya Katsuyama', stay_time: '1hr', one_line_tip: '必點伏爾加飯與蕎麥麵', tel: '0779-88-1392' }, details: { title: '福井洋食的靈魂', content: '來到勝山，絕不能錯過這裡獨有的 B 級美食伏爾加飯。這是一道充滿謎團卻又無比美味的料理，在蛋包飯上豪邁地放上一塊炸豬排，最後淋上店家特製的濃郁醬汁。Nomuraya 是當地的老字號，這裡的醬汁帶有蔬菜的甘甜，與酥脆的豬排完美契合。如果胃口允許，建議搭配福井名產越前蘿蔔泥蕎麥麵，辛辣清爽的蘿蔔泥能平衡炸物的油膩感，是完美的雙重奏。', must_eat: ['伏爾加飯 (ボルガライス)', '越前蘿蔔泥蕎麥麵', '炸豬排定食'] } } },{ id: 807, date: '08/12', type: 'transport', name: '移動：野村屋 ➡ 越前大佛', timeStart: '12:00', timeEnd: '12:30', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '前往清大寺', secondary_info: '前往最後景點' } } },
{ id: 808, date: '08/12', type: 'sight', name: '越前大佛 (清大寺)', timeStart: '12:30', timeEnd: '14:30', desc: '千佛牆視覺震撼', status: 'active', expenses: [], jp_name: '越前大仏', aiData: { category: 'activity', theme: 'blue', summary: { primary_info: '越前大佛 (清大寺)', location_keyword: 'Echizen Daibutsu', stay_time: '2hr', one_line_tip: '室內光線暗，注意快門', photo_guide: '長焦壓縮千佛牆', tel: '+81-779-87-3300' }, details: { title: '泡沫經濟下的宗教奇觀', content: '踏入清大寺的大殿，你很難不被眼前的景象震懾。17 公尺高的越前大佛端坐中央（比奈良大佛還高），而真正讓人起雞皮疙瘩的，是四周牆壁上密密麻麻、成千上萬尊的小佛像。這座建於日本泡沫經濟巔峰時期的私立寺院，雖然歷史不長，但其規模與視覺衝擊力卻是世界級的。空曠巨大的空間、無數注視著你的佛像，營造出一種超現實的、近乎科幻的宗教氛圍。', history: '由當地出身的企業家多田清斥資 380 億日圓建造，目的是為了回饋故鄉並祈求和平。雖然曾一度沒落，近年因社群媒體的傳播而成為熱門的攝影聖地。', photographer_advice: '這裡是「重複構圖 (Pattern)」的教科書。使用長焦鏡頭特寫牆面，讓佛像填滿整個畫面，創造出無限延伸的感覺。大殿內光線較暗，請提高 ISO 或使用大光圈定焦鏡。也可以嘗試將人安排在佛像前，對比出人類的渺小。', must_list: ['必拍：千佛牆', '必拍：17米大佛', '必看：五重塔'] } } },
{ id: 809, date: '08/12', type: 'transport', name: '移動：越前大佛 ➡ 福井', timeStart: '14:30', timeEnd: '15:45', desc: '自駕返回', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr 15m', transport_mode: 'car', primary_info: '返回 Orix 福井站前', secondary_info: '預留塞車緩衝' } } },
{ id: 810, date: '08/12', type: 'sight', name: '後勤：ORIX 還車', timeStart: '15:45', timeEnd: '16:00', desc: '福井站前店', status: 'active', expenses: [], jp_name: 'オリックスレンタカー', aiData: { category: 'logistics', theme: 'rose', summary: { primary_info: 'Orix 福井駅前店', location_keyword: 'Orix Rent-A-Car Fukui', stay_time: '15m', one_line_tip: '檢查是否有遺落物', tel: '+81-776-22-0543' }, details: { title: '自駕行程的終章', content: '平安回到福井站前，是時候與陪伴我們三天的座駕道別了。辦理還車手續時，請務必進行最後一次的「地毯式搜索」。門邊的置物格、遮陽板夾層、後車廂的深處，甚至是腳踏墊下，都是容易遺落物品的黑洞。別忘了拔出 ETC 卡，並確認加油收據是否已備妥（若有規定滿油還車）。', tour_guide_advice: '如果有多餘的垃圾，請詢問店員是否可以協助處理，保持禮貌是優質旅人的基本素養。', must_list: ['重點：拔除ETC卡', '重點：檢查遺落物', '重點：滿油證明'] } } },
{ id: 811, date: '08/12', type: 'transport', name: '移動：還車點 ➡ 車站', timeStart: '16:00', timeEnd: '16:15', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '前往福井站', secondary_info: '準備搭車' } } },
{ id: 812, date: '08/12', type: 'sight', name: '福井站 (候車/晚餐)', timeStart: '16:15', timeEnd: '17:31', desc: '購買便當', status: 'active', expenses: [], jp_name: '福井駅', aiData: { category: 'hub', theme: 'hub', summary: { primary_info: '福井站', location_keyword: 'Fukui Station', stay_time: '1hr 15m', one_line_tip: '推薦購買越前蟹飯便當', tel: '+81-570-00-2486' }, details: { title: '鐵道旅行的醍醐味：駅弁', content: '距離新幹線發車還有充裕的一個多小時。這段時間不是等待，而是為了下一段旅程的味覺準備。前往車站商場（Prism Fukui），這裡匯集了北陸的頂級便當。首推「越前蟹飯 (Echizen Kani-meshi)」，滿滿的蟹肉鋪在蟹黃炊煮的飯上，造型更是可愛的螃蟹形狀。或者選擇「烤鯖魚壽司」，油脂豐富的鯖魚經過炙烤，香氣四溢。', tour_guide_advice: '新幹線車程長達 4 小時，車上享用便當是鐵道旅行的樂趣之一。記得買幾罐福井限定的飲料或啤酒，讓移動過程也變成一種享受。', must_list: ['必買：越前蟹飯便當', '必買：烤鯖魚壽司', '必買：羽二重餅'] } } },
{ id: 813, date: '08/12', type: 'transport', name: '移動：福井 ➡ 大宮', timeStart: '17:31', timeEnd: '19:40', desc: 'Hakutaka 578', status: 'active', expenses: [], jp_name: 'はくたか', aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：2hr 9m', transport_mode: 'public', primary_info: '新幹線 Hakutaka 578號', secondary_info: '前往大宮轉乘' }, details: { title: '北陸新幹線 Hakutaka', content: '搭乘北陸新幹線 Hakutaka（白鷹號）經由長野前往大宮。沿途將穿越日本阿爾卑斯山脈，若天色未暗，窗外將是壯麗的山岳風景。隨著列車向東奔馳，我們正一步步告別日本海，迎向太平洋側。', must_list: ['車票保管', '享用便當'] } } },
{ id: 814, date: '08/12', type: 'sight', name: '大宮站 (轉乘)', timeStart: '19:40', timeEnd: '20:41', desc: '中途休息', status: 'active', expenses: [], jp_name: '大宮駅', aiData: { category: 'hub', theme: 'hub', summary: { primary_info: '大宮站', location_keyword: 'Omiya Station', stay_time: '1hr', one_line_tip: '站內 Ecute 逛街', tel: 'N/A' }, details: { title: '新幹線的十字路口', content: '大宮站是北陸/上越新幹線與東北新幹線的交會點。轉乘時間約 1 小時，非常充裕。大宮站站內（改札內）擁有著名的 Ecute 商場，這裡不只是車站，更像個百貨公司。', tour_guide_advice: '可以下來活動筋骨，逛逛這裡的甜點店或雜貨店。如果剛剛的便當沒吃飽，這裡還有無數熟食選擇。這是一個完美的「中場休息」。', must_list: ['必逛：Ecute商場', '休息：伸展筋骨', '補給：飲料點心'] } } },
{ id: 815, date: '08/12', type: 'transport', name: '移動：大宮 ➡ 仙台', timeStart: '20:41', timeEnd: '21:47', desc: 'Hayabusa 57', status: 'active', expenses: [], jp_name: 'はやぶさ', aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr 6m', transport_mode: 'public', primary_info: '新幹線 Hayabusa 57號', secondary_info: '前往仙台' }, details: { title: '東北新幹線 Hayabusa', content: '搭乘最高速的 Hayabusa（隼號）前往東北門戶——仙台。這列翠綠色的新幹線以每小時 320 公里的速度奔馳，僅需一小時出頭，就能將我們帶到伊達政宗的領地。' } } },
// --- Day 7: 2026/08/12 (移動日：福井 -> 仙台) ---
{ id: 816, date: '08/12', type: 'sight', name: '仙台站 (抵達)', timeStart: '21:47', timeEnd: '22:00', desc: '抵達東北', status: 'active', expenses: [], jp_name: '仙台駅', aiData: { category: 'hub', theme: 'hub', summary: { header: '抵達', primary_info: '仙台駅', location_keyword: 'Sendai Station', stay_time: '13m', one_line_tip: '出站前往西口覓食', tel: '022-222-2555' }, details: { title: '杜之都仙台', content: '抵達仙台。空氣中似乎帶著一絲東北特有的涼爽。這裡是杜之都（森林之都），也是東北最大的城市。雖然時間已晚，但仙台的夜生活才正要開始。我們的目標很明確——前往熱鬧的西口巷弄，尋找在地人的深夜食堂。' } } },
{ id: 817, date: '08/12', type: 'transport', name: '移動：車站 ➡ MOJA', timeStart: '22:00', timeEnd: '22:15', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '前往串燒 MOJA', secondary_info: '位於西口巷弄' }, details: { title: '前往紅燈籠', content: '從仙台站西口出站，步行前往名掛丁附近的巷弄。目標是充滿昭和復古氛圍的紅燈籠居酒屋。' } } },
{ id: 818, date: '08/12', type: 'food', name: '宵夜：MOJA 仙台站前', timeStart: '22:15', timeEnd: '23:15', desc: '仙台荷爾蒙燒', status: 'active', expenses: [], jp_name: '串焼ホルモン モジャ 仙台駅前店', aiData: { category: 'activity', theme: 'orange', summary: { header: '深夜居酒屋', primary_info: '串焼ホルモン モジャ 仙台駅前店', location_keyword: 'MOJA Sendai Ekimae', stay_time: '1hr', one_line_tip: '必點仙台荷爾蒙', tel: '022-265-5552' }, details: { title: '昭和復古的熱情', content: '【美食分析】\n空間氛圍：一踏入店內，就能感受到濃厚的昭和復古風情。紅燈籠、啤酒箱座椅與充滿活力的店員吆喝聲，這裡是仙台上班族下班後釋放壓力的秘密基地。\n味蕾報告：招牌的「仙台荷爾蒙 (內臟燒)」處理得極為乾淨，炭火燒烤後油脂香氣四溢，口感彈牙。搭配店家特製的鹹甜醬汁，是啤酒的最佳拍檔。串燒類也相當出色，火候控制得宜。\n點餐攻略：仙台荷爾蒙、綜合串燒、角嗨 (Highball)。', must_eat: ['仙台荷爾蒙', '蔥間肉串', '燉煮內臟'] } } },
{ id: 819, date: '08/12', type: 'transport', name: '移動：餐廳 ➡ 飯店', timeStart: '23:15', timeEnd: '23:35', desc: '穿越車站', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：20m', transport_mode: 'walk', primary_info: '返回東橫INN 東口1號', secondary_info: '穿越東西自由通路' }, details: { title: '返回東口', content: '吃飽喝足後，沿著原路返回，穿越仙台車站巨大的「東西自由通路」前往較為安靜的東口區域。' } } },
{ id: 820, date: '08/12', type: 'sight', name: '住宿：東橫INN 仙台東口1號', timeStart: '23:35', timeEnd: '23:59', desc: 'Check-in', status: 'active', expenses: [], jp_name: '東横INN仙台東口1号館', aiData: { category: 'hub', theme: 'hub', summary: { header: '終點', primary_info: '東横INN仙台東口1号館', location_keyword: 'Toyoko Inn Sendai East Exit 1', stay_time: 'Overnight', one_line_tip: '辦理入住，休息', tel: '022-298-1045' }, details: { title: '大移動日結束', content: '從福井到仙台，我們今天跨越了半個本州。完成入住手續，卸下行囊。雖然身體疲憊，但味蕾還殘留著炭火燒肉的香氣。好好休息吧，明天將租車前往藏王御釜，探索這片廣闊的東北大地。晚安。' } } },




// --- Day 8: 2025/08/13 (仙台 -> 蔵王絕景/山寺古剎 -> 山形之夜) ---
{ id: 900, date: '08/13', type: 'hub', name: '退房：東橫INN 仙台東口1號', timeStart: '07:30', timeEnd: '08:00', desc: 'Check-out', status: 'active', expenses: [], jp_name: '東横INN仙台東口1号館', aiData: { category: 'hub', theme: 'hub', summary: { header: '出發', primary_info: '東橫INN 仙台東口1號', location_keyword: 'Toyoko Inn Sendai East Exit 1', stay_time: '30m', one_line_tip: '辦理退房，確認行李數量' }, details: { title: '告別仙台', content: '早安仙台。辦理退房手續後，請確保所有行李都已整理完畢。今天將離開宮城縣前往山形縣，是一段跨越縣境的移動日，請檢查隨身物品，準備輕裝前往租車店。' } } },
{ id: 901, date: '08/13', type: 'transport', name: '移動：飯店 ➡ ORIX', timeStart: '08:00', timeEnd: '08:15', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '前往 ORIX 租車', secondary_info: '仙台站東口' }, details: { title: '前往租車點', content: '徒步前往 ORIX 租車仙台站東口店。早晨的仙台東口相對安靜，路程約 15 分鐘，請注意路況。' } } },
{ id: 902, date: '08/13', type: 'sight', name: '租車：ORIX 仙台東口', timeStart: '08:15', timeEnd: '08:45', desc: '取車與決策', status: 'active', expenses: [], jp_name: 'オリックスレンタカー仙台駅東口店', aiData: { category: 'logistics', theme: 'rose', summary: { header: '決策時刻', primary_info: 'ORIX 租車 仙台東口店', location_keyword: 'ORIX Rent-A-Car Sendai East', stay_time: '30m', one_line_tip: '檢查藏王山頂即時影像', tel: '022-791-7031' }, details: { title: '命運的分歧點', content: '辦理租車手續並檢查車況。此刻最重要的是做出決策：請立即查看藏王御釜的即時影像 (Live Camera)。若山頂清晰可見，請毫不猶豫執行 Plan A (藏王絕景)；若雲霧繚繞或下雨，則切換至 Plan B (山寺古剎)，以免上山只看到一片白牆。', must_list: ['必備：駕照正本/譯本', '任務：查看御釜天氣', '任務：設定導航'] } } },

// --- PLAN A (晴天：藏王絕景路線) ---
{ id: 903, date: '08/13', type: 'transport', name: '移動：仙台 ➡ 藏王御釜', timeStart: '08:45', timeEnd: '10:45', desc: '藏王 Echo Line', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：2hr', transport_mode: 'car', primary_info: '經由藏王 Echo Line', secondary_info: '山岳道路注意濃霧' }, details: { title: '雲端公路', content: '行駛於著名的「藏王 Echo Line」。這是一條景色變化豐富的山岳道路，隨著海拔升高，窗外景色將從森林轉為荒涼的火山地貌。後段山路蜿蜒，請保持安全車距。' } } },
{ id: 904, date: '08/13', type: 'sight', name: '藏王御釜 (Okama)', timeStart: '10:45', timeEnd: '12:45', desc: '神秘火口湖', status: 'active', plan: 'A', expenses: [], jp_name: '蔵王の御釜', aiData: { category: 'activity', theme: 'blue', summary: { header: '絕景攝影', primary_info: '藏王御釜', location_keyword: 'Zao Okama', stay_time: '2hr', one_line_tip: '山頂強風注意，必備外套', tel: '0224-34-2725' }, details: { title: '魔女的眼睛', content: '藏王連峰的象徵，翡翠綠色的強酸性火口湖。湖水顏色會隨著陽光角度與天氣而變化，因此又被稱為五色沼。山頂毫無遮蔽，風勢通常極強且氣溫較低，即使是夏季也請務必穿上防風外套。', history: '御釜是約 3000 年前火山爆發後形成的火山口湖，至今仍有火山活動跡象，展現了大自然的荒野之力。', photo_advice: '建議使用廣角鏡頭捕捉火口湖與周圍岩壁的壯闊感。若要拍攝湖面的細節與波紋，長焦鏡頭也派得上用場。若想拍攝長曝光使湖面平滑，請務必使用重型腳架並掛上重物，以免被強風吹倒。', must_list: ['必拍：翡翠綠湖水', '必訪：刈田嶺神社', '必備：防風外套'] } } },
{ id: 905, date: '08/13', type: 'transport', name: '移動：御釜 ➡ 溫泉街', timeStart: '12:45', timeEnd: '13:15', desc: '下山', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '前往藏王溫泉街', secondary_info: '連續下坡路段' }, details: { title: '前往溫泉鄉', content: '沿著山路下行前往藏王溫泉街。連續下坡請善用引擎煞車 (低速檔)，避免煞車過熱。' } } },
{ id: 806, date: '08/13', type: 'food', name: '食事処 とみたや', timeStart: '13:15', timeEnd: '14:45', desc: '成吉思汗烤肉', status: 'active', plan: 'A', expenses: [], jp_name: '食事処 とみたや', aiData: { category: 'activity', theme: 'orange', summary: { header: '在地午餐', primary_info: '食事処 とみたや', location_keyword: 'Tomitaya Zao', stay_time: '1hr 30m', one_line_tip: '自家製醬汁成吉思汗鍋', tel: '023-694-9436' }, details: { title: '藏王成吉思汗名店', content: '位於藏王溫泉街中心的老字號食堂。這裡的招牌「成吉思汗定食」使用自家製的生羊肉，肉質厚實且無羶味，搭配祖傳 50 年的秘製醬汁，超級下飯。如果在街上沒買到「稻花餅 (Igamochi)」，這裡通常也點得到，是少數能同時享用兩大藏王名物的地方。', must_eat: ['成吉思汗定食', '稻花餅 (甜點)', '鳥中華 (雞肉拉麵)'] } } },
{ id: 907, date: '08/13', type: 'sight', name: '藏王大露天風呂', timeStart: '14:45', timeEnd: '16:15', desc: '強酸性硫磺泉', status: 'active', plan: 'A', expenses: [], jp_name: '蔵王温泉大露天風呂', aiData: { category: 'activity', theme: 'blue', summary: { header: '野趣溫泉', primary_info: '藏王溫泉大露天風呂', location_keyword: 'Zao Onsen Open Air Bath', stay_time: '1hr 30m', one_line_tip: '純泡湯，不可使用肥皂', tel: '023-694-9417' }, details: { title: '與溪流共浴', content: '這是一個能容納 200 人的巨大露天風呂，緊鄰著溪流，充滿野趣。泉質是強酸性的硫磺泉，有「姬之湯」的美譽，能讓皮膚滑嫩。這裡沒有淋浴設備，也不能使用肥皂或洗髮精，請純粹享受溫泉與大自然的結合，徹底放鬆駕駛的疲勞。', history: '藏王溫泉開湯於西元 110 年，是日本屈指可數的古湯，歷史悠久。', photo_advice: '全區嚴禁攝影。請用心感受溪流聲、樹林光影與硫磺香氣，將這份體驗刻在腦海中。', must_list: ['體驗：強酸性泉質', '注意：銀飾易變黑', '必備：毛巾'] } } },
{ id: 908, date: '08/13', type: 'sight', name: '溫泉街散策', timeStart: '16:15', timeEnd: '16:45', desc: '漫步', status: 'active', plan: 'A', expenses: [], jp_name: '蔵王温泉街', aiData: { category: 'activity', theme: 'blue', summary: { header: '散步', primary_info: '藏王溫泉街', location_keyword: 'Zao Onsen Street', stay_time: '30m', one_line_tip: '感受硫磺煙霧氛圍', tel: 'N/A' }, details: { title: '硫磺香氣的街道', content: '泡完溫泉後，在溫泉街稍作散步。街道旁的水溝冒著熱氣，硫磺味瀰漫，這是溫泉鄉獨有的氛圍。可以在此購買一些伴手禮，或單純享受傍晚的山區涼意。' } } },

// --- PLAN B (陰雨天：秋保/山寺古剎路線) ---
{ id: 920, date: '08/13', type: 'transport', name: '移動：仙台 ➡ 秋保大瀑布', timeStart: '08:45', timeEnd: '09:45', desc: '自駕', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr', transport_mode: 'car', primary_info: '前往秋保大瀑布', secondary_info: '仙台市郊' }, details: { title: '前往名瀑', content: '駕車前往仙台市郊的秋保大瀑布。這段路程相對平緩，適合放鬆心情駕駛。' } } },
{ id: 921, date: '08/13', type: 'sight', name: '秋保大瀑布', timeStart: '09:45', timeEnd: '10:30', desc: '日本三名瀑', status: 'active', plan: 'B', expenses: [], jp_name: '秋保大滝', aiData: { category: 'activity', theme: 'blue', summary: { header: '瀑布攝影', primary_info: '秋保大瀑布', location_keyword: 'Akiu Great Falls', stay_time: '45m', one_line_tip: '陰天適合慢快門拍攝', tel: '022-398-2323' }, details: { title: '負離子的洗禮', content: '日本三名瀑之一，落差 55 公尺，水量豐沛。陰天雖然沒有陽光，但散射光反而能減少反差，讓瀑布的水流層次與周圍綠葉的細節更加豐富。可以嘗試走到瀑布下方的觀景台，感受水氣的震撼。', photo_advice: '陰天是拍攝瀑布的好時機。建議使用腳架與慢速快門 (1/2秒至1秒) 來霧化水流，展現絲絹般的質感。注意鏡頭防水氣。', must_list: ['必拍：瀧壺視角', '必訪：不動尊', '注意：階梯濕滑'] } } },
{ id: 922, date: '08/13', type: 'transport', name: '移動：秋保 ➡ 山寺', timeStart: '10:30', timeEnd: '11:20', desc: '跨縣移動', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：50m', transport_mode: 'car', primary_info: '前往山寺登山口', secondary_info: '穿越山區' }, details: { title: '前往靈場', content: '駕車穿越宮城與山形的縣境，前往著名的山寺 (立石寺)。沿途山景秀麗。' } } },
{ id: 923, date: '08/13', type: 'food', name: '午餐：對面石', timeStart: '11:20', timeEnd: '12:50', desc: '山寺名物', status: 'active', plan: 'B', expenses: [], jp_name: 'お休処 対面石', aiData: { category: 'activity', theme: 'orange', summary: { header: '登山前補給', primary_info: 'お休処 対面石', location_keyword: 'Taimenseki Yamadera', stay_time: '1hr 30m', one_line_tip: '面對芭蕉記念館的食堂', tel: '023-695-2116' }, details: { title: '傳統食堂的溫暖', content: '位於山寺登山口附近的傳統食堂。空間氛圍樸實，榻榻米座位讓人感到放鬆。这里的「芋煮鍋」是山形縣的靈魂食物，醬油湯底燉煮里芋與牛肉，溫暖且飽足。在挑戰千階石階前，這是一頓完美的能量補給餐。另外，手工蕎麥麵也是這裡的人氣選擇，麵條勁道，香氣十足。', must_eat: ['山形芋煮定食', '手工蕎麥麵', '力蒟蒻'] } } },
{ id: 924, date: '08/13', type: 'sight', name: '山寺 (立石寺)', timeStart: '12:50', timeEnd: '15:20', desc: '1015階的挑戰', status: 'active', plan: 'B', expenses: [], jp_name: '宝珠山 立石寺', aiData: { category: 'activity', theme: 'blue', summary: { header: '靈場巡禮', primary_info: '山寺 (立石寺)', location_keyword: 'Risshakuji Temple', stay_time: '2hr 30m', one_line_tip: '雨中青苔更顯翠綠', tel: '023-695-2843' }, details: { title: '蟬聲滲入岩石中', content: '東北四大寺之一。沿著杉木林中的 1015 階石階一步步向上，雖然辛苦，但每一步都是修行。若是雨天造訪，雨水潤濕了參道兩旁的青苔與岩石，翠綠的色彩會變得異常飽和且深邃，展現出與晴天截然不同的幽玄之美。登上五大堂，俯瞰山下村落與雲霧繚繞的山谷，視野極佳。', history: '由慈覺大師圓仁於西元 860 年開山，松尾芭蕉曾在此留下名句。', photo_advice: '雨天攝影重點在於「質感」。利用偏光鏡 (CPL) 消除葉面反光，凸顯青苔的綠意。五大堂的展望是必拍構圖。', must_list: ['必拍：五大堂絕景', '必拍：納經堂', '必看：姥堂'] } } },
{ id: 925, date: '08/13', type: 'food', name: '休息：常力坊', timeStart: '15:20', timeEnd: '15:50', desc: '下山休憩', status: 'active', plan: 'B', expenses: [], jp_name: 'そば処 常力坊', aiData: { category: 'activity', theme: 'orange', summary: { header: '甜點時間', primary_info: 'そば処 常力坊', location_keyword: 'Jorikibo Yamadera', stay_time: '30m', one_line_tip: '享用櫻桃霜淇淋或蕎麥', tel: '023-695-2015' }, details: { title: '登山後的獎勵', content: '下山後雙腿可能有些顫抖，這時候最適合找個地方坐下來休息。常力坊提供美味的蕎麥麵與甜點。推薦嘗試山形特產的「櫻桃霜淇淋」，酸甜的口感能瞬間消除疲勞。店內氛圍傳統雅致，是整理裝備與調整氣息的好地方。', must_eat: ['櫻桃霜淇淋', '蕎麥茶'] } } },
{ id: 926, date: '08/13', type: 'transport', name: '移動：山寺 ➡ 文翔館', timeStart: '15:50', timeEnd: '16:35', desc: '前往市區', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：45m', transport_mode: 'car', primary_info: '前往文翔館', secondary_info: '山形市中心' }, details: { title: '前往舊縣廳', content: '駕車前往山形市中心的文翔館。沿途可以感受山形市的街道風情。' } } },
{ id: 927, date: '08/13', type: 'sight', name: '文翔館 (舊縣廳)', timeStart: '16:35', timeEnd: '17:20', desc: '大正浪漫', status: 'active', plan: 'B', expenses: [], jp_name: '山形県郷土館 文翔館', aiData: { category: 'activity', theme: 'blue', summary: { header: '建築攝影', primary_info: '文翔館 (舊縣廳)', location_keyword: 'Bunshokan', stay_time: '45m', one_line_tip: '雨天室內光影效果佳', tel: '023-635-5500' }, details: { title: '紅磚的記憶', content: '這是一座英國文藝復興樣式的紅磚建築，建於大正年間，充滿了濃厚的復古氛圍。若是雨天，濕潤的紅磚外牆顏色會更加深沉飽和；室內的高挑長廊、古典鐘塔與精緻的灰泥裝飾，在陰雨天的柔和光線下，光影層次分明，非常適合拍攝人像或建築細節。', history: '曾作為山形縣廳與縣議會使用，是國家指定重要文化財。', photo_advice: '利用室內走廊的透視感進行構圖。中庭的紅磚牆也是絕佳的背景。', must_list: ['必拍：中央樓梯', '必拍：議場大廳', '必看：鐘塔'] } } },

// --- 共同結尾 (山形之夜) ---
{ id: 940, date: '08/13', type: 'transport', name: '移動：前往飯店', timeStart: '16:45', timeEnd: '17:40', desc: '自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動', transport_mode: 'car', primary_info: '前往山形站西口', secondary_info: 'Plan A/B 匯合' }, details: { title: '前往住宿點', content: '無論是從藏王下山還是從文翔館出發，此刻都將前往今晚的住宿點：山形站西口。下班時間市區車流可能稍多，請注意安全。' } } },
{ id: 941, date: '08/13', type: 'hub', name: '住宿：東橫INN 山形站西口', timeStart: '17:40', timeEnd: '18:10', desc: 'Check-in', status: 'active', expenses: [], jp_name: '東横INN山形駅西口', aiData: { category: 'hub', theme: 'hub', summary: { header: '住宿', primary_info: '東橫INN 山形站西口', location_keyword: 'Toyoko Inn Yamagata Station West', stay_time: '30m', one_line_tip: '辦理入住，停車', tel: '023-644-1045' }, details: { title: '山形據點', content: '抵達飯店，將車停在飯店停車場或周邊特約停車場。辦理入住手續，將行李放進房間。利用這 30 分鐘稍微整理一下儀容，準備迎接今晚的重頭戲——山形牛晚餐。' } } },
{ id: 942, date: '08/13', type: 'transport', name: '移動：飯店 ➡ 晚餐', timeStart: '18:10', timeEnd: '18:40', desc: '前往餐廳', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '前往晚餐地點', secondary_info: '準備享用美食' }, details: { title: '美食之路', content: '駕車前往預訂的餐廳。今晚的目標是頂級的山形牛，心情也隨之雀躍起來。' } } },
{ id: 943, date: '08/13', type: 'food', name: '[主案] 燒肉名匠 山牛', timeStart: '18:40', timeEnd: '20:40', desc: '頂級山形牛', status: 'active',  expenses: [], jp_name: '焼肉名匠 山牛 山形店', aiData: { category: 'activity', theme: 'orange', summary: { header: '豪華晚餐', primary_info: '燒肉名匠 山牛 山形店', location_keyword: 'Yakiniku Yamagyu Yamagata', stay_time: '2hr', one_line_tip: '務必提前預約，A5和牛', tel: '023-666-6129' }, details: { title: '肉食者的天堂', content: '山牛是由當地的肉舖直營，這意味著你能以相對合理的價格，享受到最高品質的「山形牛」。店內空間寬敞，設有包廂，裝潢呈現沉穩的和風現代感，非常適合細細品味美食。這裡的牛肉油脂分佈如同大理石般美麗，放上烤網的瞬間，油脂滴落炭火激起的香氣令人陶醉。入口即化的口感與濃郁的肉汁，絕對是這趟旅程的味覺頂點。\n\n**點餐攻略**：必點「山牛盛合（拼盤）」，可以一次吃到多個稀有部位。搭配山形縣產的白米飯，是無與倫比的享受。', must_eat: ['山牛盛合', '極上厚切牛舌', '山形產白飯'] } } },
{ id: 944, date: '08/13', type: 'food', name: ' [備案] 続おそばに', timeStart: '18:40', timeEnd: '20:40', desc: '深夜蕎麥麵', status: 'active',  expenses: [], jp_name: '続おそばに', aiData: { category: 'activity', theme: 'orange', summary: { header: '在地備案', primary_info: '[備案]続おそばに', location_keyword: 'Soku Osobani', stay_time: '2hr', one_line_tip: '在地人喜愛的蕎麥居酒屋', tel: '023-633-3451' }, details: { title: '山形的深夜食堂', content: '如果預約不到燒肉，這裡是體驗山形在地氛圍的絕佳選擇。這是一家深受當地人喜愛的蕎麥麵店兼居酒屋，營業至深夜。店內氣氛熱鬧，充滿了昭和時代的懷舊感。除了招牌的手打蕎麥麵外，這裡的清酒種類豐富，下酒菜也毫不馬虎。\n\n**味蕾報告**：蕎麥麵條帶有獨特的嚼勁與香氣，湯頭甘甜。這裡的「鳥中華」也是隱藏版的人氣菜單。\n**點餐攻略**：板蕎麥 (Ita Soba)、鳥中華拉麵、當地清酒試飲。', must_eat: ['板蕎麥', '鳥中華', '山形地酒'] } } },
{ id: 945, date: '08/13', type: 'transport', name: '移動：餐廳 ➡ 飯店', timeStart: '20:40', timeEnd: '20:55', desc: '回飯店', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '返回東橫INN', secondary_info: '結束行程' }, details: { title: '歸途', content: '滿足地結束晚餐，返回飯店。若是從山牛步行回來，可以順道感受一下山形市夜晚的涼爽空氣。' } } },
{ id: 946, date: '08/13', type: 'hub', name: '休息：東橫INN 山形站西口', timeStart: '20:55', timeEnd: '23:59', desc: '休息', status: 'active', expenses: [], jp_name: '東横INN山形駅西口', aiData: { category: 'hub', theme: 'hub', summary: { header: '終點', primary_info: '東橫INN 山形站西口', location_keyword: 'Toyoko Inn Yamagata Station West', stay_time: 'Overnight', one_line_tip: '整理儀容，備份照片' }, details: { title: '養精蓄銳', content: '回到房間，提早結束今天的行程是為了讓身體充分休息。整理一下這兩天累積的髒衣物，將相機記憶卡備份。明天也是充實的一天，請確保有足夠的睡眠。晚安。' } } },



// --- Day 9: 2026/08/14 (梯田晨光、古剎巡禮與山形花火) ---
{ id: 947, date: '08/14', type: 'hub', name: '準備：東横INN山形駅西口', timeStart: '03:10', timeEnd: '03:40', desc: '特種兵起床', status: 'active', expenses: [], jp_name: '東横INN山形駅西口', aiData: { category: 'hub', theme: 'hub', summary: { header: '整備', primary_info: '東横INN山形駅西口', location_keyword: 'Toyoko Inn Yamagata Station West', stay_time: '30m', one_line_tip: '輕聲出門，檢查記憶卡', tel: '023-644-1045' }, details: { title: '黎明前的出擊', content: '凌晨 03:10 起床。這是一個為了絕景而燃燒的早晨，請盡量輕聲細語以免打擾其他房客。出門前請務必進行最後的裝備確認：記憶卡是否有足夠空間錄製花火影片？電池是否已充滿？腳架與快門線是否都在包包裡？帶上一罐熱咖啡提神，準備迎接椹平梯田的日出。' } } },
{ id: 948, date: '08/14', type: 'transport', name: '移動：飯店 ➡ 梯田', timeStart: '03:40', timeEnd: '04:25', desc: '夜間自駕', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：45m', transport_mode: 'car', primary_info: '前往椹平の棚田', secondary_info: '國道287號' }, details: { title: '穿越黑夜', content: '行駛於深夜的國道 287 號前往朝日町。山區道路路燈較少，且此時段容易遇到野生動物（如狸貓或鹿）出沒，請務必放慢車速，小心駕駛。' } } },
{ id: 949, date: '08/14', type: 'sight', name: '椹平の棚田', timeStart: '04:25', timeEnd: '06:00', desc: '日本梯田百選', status: 'active', expenses: [], jp_name: '椹平の棚田', aiData: { category: 'activity', theme: 'blue', summary: { header: '日出攝影', primary_info: '椹平の棚田', location_keyword: 'Kunugidaira Terraced Rice Fields', stay_time: '1hr 35m', one_line_tip: '從一本松公園展望台拍攝', tel: '0237-67-2111' }, details: { title: '扇形的黃金大地', content: '被選為日本梯田百選之一，位於朝日町的最上川沿岸。200 多塊水田呈現美麗的扇形展開，與蜿蜒的河川相映成趣。清晨時分，若運氣好遇到晨霧或雲海，金色的陽光灑在水田與霧氣上，會形成如夢似幻的光影層次，是攝影師夢寐以求的畫面。這裡有著名的「一本杭（一本古木）」，是構圖的靈魂。', history: '這些梯田是江戶時代當地農民為了生存而開墾的智慧結晶，至今仍由當地農家代代守護，保持著原始的里山風貌。', photo_advice: '請前往對面的「一本松公園」展望台，這是最佳制高點。使用廣角鏡頭拍攝梯田全景與最上川的曲線，或用長焦鏡頭特寫一本杭與水田的光影變化。注意日出時的高反差控制。', must_list: ['必拍：扇形梯田全景', '必看：最上川晨霧', '必備：穩固腳架'] } } },

// --- PLAN A: 慈恩寺 (補眠與古剎) ---
{ id: 950, date: '08/14', type: 'transport', name: '移動：梯田 ➡ 慈恩寺', timeStart: '06:00', timeEnd: '06:40', desc: '順路移動', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：40m', transport_mode: 'car', primary_info: '前往寒河江 慈恩寺', secondary_info: '沿最上川行駛' }, details: { title: '順流而下', content: '沿著最上川行駛，前往寒河江市。這條路線完全順路返回山形方向，且沿途風景優美，適合晨間兜風。' } } },
{ id: 951, date: '08/14', type: 'hub', name: '休息：慈恩寺停車場', timeStart: '06:40', timeEnd: '08:30', desc: '車中泊補眠', status: 'active', plan: 'A', expenses: [], jp_name: '本山慈恩寺 駐車場', aiData: { category: 'hub', theme: 'hub', summary: { header: '補眠', primary_info: '本山慈恩寺 駐車場', location_keyword: 'Honzan Jionji Parking', stay_time: '1hr 50m', one_line_tip: '償還睡眠債，為晚上充電', tel: '0237-87-3993' }, details: { title: '戰術性睡眠', content: '距離慈恩寺 08:30 開門還有近兩小時。這是極為寶貴的補眠時間。將座椅放平，設好鬧鐘，好好睡一覺。凌晨早起的疲勞若不在此刻消除，晚上的花火拍攝將會非常痛苦。慈恩寺停車場寬敞且安靜，是絕佳的休息點。' } } },
{ id: 952, date: '08/14', type: 'sight', name: '瑞宝山 本山慈恩寺', timeStart: '08:30', timeEnd: '10:00', desc: '千年古剎', status: 'active', plan: 'A', expenses: [], jp_name: '瑞宝山 本山慈恩寺', aiData: { category: 'activity', theme: 'blue', summary: { header: '古剎巡禮', primary_info: '瑞宝山 本山慈恩寺', location_keyword: 'Honzan Jionji Temple', stay_time: '1hr 30m', one_line_tip: '拍攝茅草屋頂本堂', tel: '0237-87-3993' }, details: { title: '穿越時空的靜寂', content: '這是一座擁有 1300 年歷史的古剎，曾是東北地區佛教文化的中心。境內的本堂是國家指定重要文化財，巨大的茅草屋頂充滿了歷史的厚重感。與熱門的山寺不同，這裡遊客較少，充滿了靜謐與莊嚴的氛圍。漫步在三重塔與松樹林間，聽著鳥鳴，能讓心靈徹底平靜。', history: '創建於天平神護 2 年 (746年)，由聖武天皇敕命建造，平安時代至鎌倉時代極為繁榮，保留了許多平安時期的佛像。', photo_advice: '使用標準至長焦鏡頭，拍攝茅草屋頂的質感與曲線。三重塔與周圍綠樹的搭配也是經典構圖。尋找庭園中的光影，拍攝出幽玄的感覺。', must_list: ['必看：茅草屋頂本堂', '必拍：三重塔', '必訪：慈恩寺Terrace'] } } },
{ id: 953, date: '08/14', type: 'transport', name: '移動：慈恩寺 ➡ 栄屋本店', timeStart: '10:00', timeEnd: '10:40', desc: '前往市區', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：40m', transport_mode: 'car', primary_info: '前往栄屋本店', secondary_info: '七日町周邊停車' }, details: { title: '返回都會', content: '離開寒河江，駕車前往山形市中心。目標是七日町附近的停車場，準備與 Plan B 的行程匯合享用午餐。' } } },

// --- PLAN B: 山寺 (晨間攻頂) ---
{ id: 954, date: '08/14', type: 'transport', name: '移動：梯田 ➡ 山寺', timeStart: '06:00', timeEnd: '07:00', desc: '長途移動', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr', transport_mode: 'car', primary_info: '前往山寺登山口', secondary_info: '走外環道避開車流' }, details: { title: '前往靈場', content: '車程約 1 小時。建議走山形市的外環道路，避開市區早晨的上班車流，直接前往山寺登山口。' } } },
{ id: 955, date: '08/14', type: 'sight', name: '山寺 (立石寺)', timeStart: '07:00', timeEnd: '09:30', desc: '1015階修行', status: 'active', plan: 'B', expenses: [], jp_name: '宝珠山 立石寺', aiData: { category: 'activity', theme: 'blue', summary: { header: '晨間登山', primary_info: '山寺（立石寺）', location_keyword: 'Risshakuji Temple', stay_time: '2hr 30m', one_line_tip: '趁遊客未到時攻頂', tel: '023-695-2843' }, details: { title: '清晨的修行', content: '選擇在清晨 7 點攻頂是明智之舉。此時遊客稀少，空氣涼爽，可以獨享這份清幽。沿著 1015 階石階向上，陽光穿透杉林灑在青苔上，景色極美。抵達五大堂時，俯瞰山谷的景色將是最好的獎勵。請注意配速，下山時腿部肌肉可能會有些顫抖。', history: '由慈覺大師圓仁開山，是松尾芭蕉吟詠名句之地，也是消除惡緣的靈場。', photo_advice: '早晨的光線適合拍攝「仁王門」的側光質感。在五大堂拍攝俯瞰景時，試著將通過山谷的仙山線列車一同入鏡。', must_list: ['必拍：五大堂絕景', '必看：根本中堂(不滅法燈)', '必備：毛巾與水'] } } },
{ id: 956, date: '08/14', type: 'transport', name: '移動：山寺 ➡ 栄屋本店', timeStart: '09:30', timeEnd: '10:30', desc: '前往市區', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr', transport_mode: 'car', primary_info: '前往栄屋本店', secondary_info: '七日町周邊停車' }, details: { title: '下山移動', content: '帶著微酸的雙腿駕車前往山形市中心。目標是七日町附近的停車場，準備享用那一碗傳說中的冷拉麵。' } } },

// --- 共同行程 (匯合：花火前哨戰) ---
{ id: 957, date: '08/14', type: 'food', name: '栄屋本店 (冷拉麵)', timeStart: '11:00', timeEnd: '12:15', desc: '夏日必吃', status: 'active', expenses: [], jp_name: '栄屋本店', aiData: { category: 'activity', theme: 'orange', summary: { header: '必吃午餐', primary_info: '栄屋本店', location_keyword: 'Sakaeya Honten', stay_time: '1hr 15m', one_line_tip: '山形冷拉麵創始店', tel: '023-623-0766' }, details: { title: '酷熱中的救贖', content: '【美食分析】\n空間氛圍：這是一家充滿昭和氣息的老字號食堂，牆上掛滿了名人的簽名，服務員阿姨們親切而忙碌，充滿了在地生活的煙火氣。\n味蕾報告：這裡的「冷拉麵」並非一般的涼麵，而是連湯帶麵都是冰鎮的。牛骨與鰹魚熬製的湯頭清爽鮮美，完全沒有油脂凝固的油膩感，麵條Q彈有勁。對於剛曬完太陽或爬完山的身體來說，這一口冰涼的湯頭簡直是救贖。\n點餐攻略：第一次來絕對要點招牌「冷しらーめん (冷拉麵)」。', must_eat: ['冷拉麵', '溫拉麵 (對比用)', '山形出汁豆腐'] } } },
{ id: 958, date: '08/14', type: 'transport', name: '移動：餐廳 ➡ 飯店', timeStart: '12:15', timeEnd: '12:30', desc: '返回飯店', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '返回東横INN', secondary_info: '停車休息' }, details: { title: '戰術性撤退', content: '午餐後，駕車返回飯店。將車停在飯店停車場，準備進行午後的體力恢復。' } } },
{ id: 959, date: '08/14', type: 'hub', name: '強制午睡 (Power Nap)', timeStart: '12:30', timeEnd: '15:20', desc: '體力回充', status: 'active', expenses: [], jp_name: '仮眠', aiData: { category: 'activity', theme: 'blue', summary: { header: '重要任務', primary_info: '東横INN山形駅西口', location_keyword: 'Toyoko Inn Yamagata Station West', stay_time: '2hr 50m', one_line_tip: '務必睡覺，為花火充電' }, details: { title: '為了夜晚的戰鬥', content: '請聽從導遊的建議：無論您早上走了 A 還是 B 路線，此刻必須強迫自己睡覺。凌晨 3 點起床的代價會在傍晚顯現，若不補眠，晚上的花火後半場您將會精神渙散，無法專注拍攝。拉上窗簾，戴上耳塞，這是一場為了高品質攝影作品而進行的戰術性休整。', history: '休息是為了走更長遠的路。', photo_advice: '夢中演練花火構圖。', must_list: ['重點：深層睡眠', '重點：設定鬧鐘', '重點：補充水分'] } } },
{ id: 960, date: '08/14', type: 'sight', name: '器材準備', timeStart: '15:20', timeEnd: '15:30', desc: '整裝', status: 'active', expenses: [], jp_name: '機材準備', aiData: { category: 'activity', theme: 'blue', summary: { header: '整備', primary_info: '器材與物資確認', location_keyword: 'Preparation', stay_time: '10m', one_line_tip: '檢查腳架、黑卡、防蚊液' }, details: { title: '花火裝備檢查', content: '清點所有裝備：穩固的腳架（必備）、快門線（必備）、黑卡（選用）、折疊板凳、防蚊液、手電筒（找東西用）、雨具。待會要去超市買晚餐，所以不用擔心乾糧。確認記憶卡已清空，電池已充滿。', history: '工欲善其事，必先利其器。', photo_advice: '將相機設定調整為 B 快門模式，ISO 100，光圈 F11，並確認無限遠對焦位置。', must_list: ['必備：腳架/快門線', '必備：防蚊液/手電筒', '任務：清空記憶卡'] } } },
{ id: 961, date: '08/14', type: 'transport', name: '移動：飯店 ➡ 超市', timeStart: '15:30', timeEnd: '15:40', desc: '前往補給', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'car', primary_info: '前往ヤマザワ 松見町店', secondary_info: '順路採買晚餐' }, details: { title: '物資補給', content: '在前往拍攝點的路上，順道去當地的超市採買晚餐和飲料。' } } },
{ id: 962, date: '08/14', type: 'sight', name: '採買：Yamazawa', timeStart: '15:40', timeEnd: '16:15', desc: '晚餐補給', status: 'active', expenses: [], jp_name: 'ヤマザワ 松見町店', aiData: { category: 'logistics', theme: 'rose', summary: { header: '補給', primary_info: 'ヤマザワ 松見町店', location_keyword: 'Yamazawa Matsumicho', stay_time: '35m', one_line_tip: '購買便當、炸物、飲料', tel: '023-631-1661' }, details: { title: '花火大會的糧倉', content: '這是一間大型的在地超市。花火大會的等待時間很長，建議在這裡買好豐盛的便當、炸物熟食、零食以及足夠的飲料（綠茶或水）。超市的價格比便利商店親民，選擇也更多。記得多買一個塑膠袋裝垃圾。', must_list: ['必買：晚餐便當', '必買：茶水飲料', '必備：垃圾袋'] } } },
{ id: 963, date: '08/14', type: 'transport', name: '移動：超市 ➡ 西藏王', timeStart: '16:15', timeEnd: '16:30', desc: '前往攝點', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '前往西蔵王公園展望広場', secondary_info: '提早出發避開管制' }, details: { title: '搶先一步', content: '帶著補給品，駕車前往拍攝點。目標是「西蔵王公園展望広場」。市區往山區的道路車流開始增加，這個時間點出發是關鍵。' } } },
{ id: 964, date: '08/14', type: 'scouting', name: '待機：西蔵王公園', timeStart: '16:30', timeEnd: '19:00', desc: '夜景花火', status: 'active', expenses: [], jp_name: '西蔵王公園 展望広場', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '卡位', primary_info: '西蔵王公園 展望広場', location_keyword: 'Nishizao Park Observatory', stay_time: '2hr 30m', one_line_tip: '架設腳架，確認夜景構圖', photo_guide: '長焦壓縮夜景與花火' }, details: { title: '俯瞰山形的夜', content: '這裡是可以同時拍攝「山形市夜景」與「花火」的絕佳地點。雖然距離花火發射點較遠，花火在畫面中會比較小，但配合璀璨的夜景，能拍出極具層次感的作品。利用這段時間架設腳架，確認水平，並享用剛剛在 Yamazawa 買的晚餐。天色漸暗，城市的燈光亮起，是拍攝 Blue Hour 夜景的好時機。' } } },
{ id: 965, date: '08/14', type: 'sight', name: '山形大花火大會', timeStart: '19:00', timeEnd: '21:00', desc: '夏夜盛典', status: 'active', expenses: [], jp_name: '山形大花火大会', aiData: { category: 'activity', theme: 'blue', summary: { header: '實戰', primary_info: '山形大花火大会', location_keyword: 'Yamagata Fireworks', stay_time: '2hr', one_line_tip: '注意風向與煙霧', tel: '023-632-8665' }, details: { title: '須川河畔的藝術', content: '山形縣最大規模的花火大會，兩萬發花火在夜空中綻放。特色是結合了音樂的「音樂花火」以及充滿魄力的「10號玉」。若在西藏王公園，重點是捕捉花火在夜景上空綻放的層次感。請隨時注意風向，若煙霧滯留，適時使用黑卡遮擋或暫停拍攝。', history: '始於 1980 年，是山形市民夏日最重要的祭典之一。', photo_advice: '使用 B 快門，光圈 F8-F11，ISO 100。每發花火結束後，適度遮擋鏡頭（黑卡）以防過曝或雜光干擾。', must_list: ['必拍：音樂花火', '必拍：尺玉連發', '必備：耐心'] } } },
{ id: 966, date: '08/14', type: 'transport', name: '移動：攝點 ➡ 飯店', timeStart: '21:00', timeEnd: '21:30', desc: '撤收', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '返回東横INN', secondary_info: '下山車多注意安全' }, details: { title: '撤收戰', content: '花火結束後，迅速收拾器材。下山路段可能會有散場車潮，請保持耐心，安全駕駛返回飯店。' } } },
{ id: 967, date: '08/14', type: 'hub', name: '休息：東横INN山形駅西口', timeStart: '21:30', timeEnd: '22:00', desc: '休息', status: 'active', expenses: [], jp_name: '東横INN山形駅西口', aiData: { category: 'hub', theme: 'hub', summary: { header: '終點', primary_info: '東横INN山形駅西口', location_keyword: 'Toyoko Inn Yamagata Station West', stay_time: 'Overnight', one_line_tip: '備份照片，充電' }, details: { title: '漫長的一天', content: '回到飯店，您完成了一場從凌晨 3 點跨越到晚上 9 點的攝影馬拉松。現在最重要的事情是備份今天的照片，並幫所有電池充電。明天將前往充滿大正浪漫氣息的銀山溫泉，那是另一個截然不同的世界。晚安。' } } },


// --- Day 10: 2026/08/15 (赤川花火大會決戰日) ---
{ id: 968, date: '08/15', type: 'hub', name: '出發：東橫INN 山形站西口', timeStart: '05:00', timeEnd: '05:30', desc: '決戰日整備', status: 'active', expenses: [], jp_name: '東横INN山形駅西口', aiData: { category: 'logistics', theme: 'rose', summary: { header: '出發', primary_info: '東橫INN 山形站西口', location_keyword: 'Toyoko Inn Yamagata Station West', stay_time: '30m', one_line_tip: '檢查裝備，輕裝出發', tel: '023-644-1045' }, details: { title: '花火特攻隊', content: '今天是赤川花火大會的日子，預計會有數十萬人湧入鶴岡與三川地區。清晨 05:00 準時出發是避開山形自動車道塞車潮的關鍵。請再次確認攝影裝備：腳架、重物（現場風大需壓腳架）、快門線、備用電池都帶齊了嗎？如果是續住，將不必要的行李留在房間，輕裝上陣。', must_list: ['任務：檢查腳架重物', '任務：確認記憶卡', '任務：提神咖啡'] } } },
{ id: 969, date: '08/15', type: 'transport', name: '移動：山形 ➡ 赤川', timeStart: '05:30', timeEnd: '08:00', desc: '早鳥移動', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：2hr 30m', transport_mode: 'car', primary_info: '前往赤川花火北岸', secondary_info: '行駛山形自動車道' }, details: { title: '穿越出羽三山', content: '行駛山形自動車道前往庄內地區。這條路在花火當天中午過後會變成大型停車場，早晨出發能享受順暢的駕駛體驗。目標導航設定為赤川北岸的座標點。' } } },
{ id: 970, date: '08/15', type: 'scouting', name: '卡位：赤川花火北岸', timeStart: '08:00', timeEnd: '08:40', desc: '下錨佔位', status: 'active', expenses: [], jp_name: '赤川花火大会 北側観覧席', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '佔位', primary_info: '赤川花火北岸', location_keyword: '38.731466, 139.857312', stay_time: '40m', one_line_tip: '風大務必固定腳架', photo_guide: '確認水平與廣角構圖' }, details: { title: '決定勝負的早晨', content: '赤川河堤的風勢通常強勁，這裡沒有建築物遮蔽。佔位時除了鋪設野餐墊，最重要的是先將腳架架設好，並利用水桶或石頭袋增加重量，避免被風吹倒。確認構圖範圍能涵蓋 700 公尺寬的發射面後，拍照記錄位置，即可暫時離開前往周邊景點。' } } },
{ id: 971, date: '08/15', type: 'transport', name: '移動：赤川 ➡ 月山高原', timeStart: '08:40', timeEnd: '09:10', desc: '前往花田', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '前往月山高原向日葵畑', secondary_info: '鶴岡方向' }, details: { title: '追逐陽光', content: '從赤川河畔驅車前往位於羽黑町的月山高原。約 30 分鐘車程。' } } },
{ id: 972, date: '08/15', type: 'sight', name: '月山高原向日葵畑', timeStart: '09:10', timeEnd: '10:10', desc: '百萬朵向日葵', status: 'active', expenses: [], jp_name: '月山高原ひまわり畑', aiData: { category: 'activity', theme: 'blue', summary: { header: '花海攝影', primary_info: '月山高原向日葵畑', location_keyword: 'Gassan Kogen Sunflower Field', stay_time: '1hr', one_line_tip: '上午順光適合拍攝', tel: '0235-62-4727' }, details: { title: '盛夏的金黃海洋', content: '佔地廣大的高原上，種植了約 100 萬朵向日葵。上午時段是最佳拍攝時間，因為向日葵花盤會朝向東方，此時順光拍攝能得到色彩飽和藍天與黃花。背景有巨大的風車與月山連峰，使用廣角鏡頭可以拍出氣勢磅礴的風景照。', history: '位於月山山腳下，利用休耕田種植，是庄內地區夏季的代表性景點。', photo_advice: '利用低角度仰拍，讓向日葵充滿畫面下緣，背景帶入藍天與風車。', must_list: ['必拍：風車與花海', '必看：幸福之鐘', '必備：防曬乳'] } } },
{ id: 973, date: '08/15', type: 'transport', name: '移動：月山高原 ➡ 羽黑山', timeStart: '10:10', timeEnd: '10:40', desc: '前往隨神門', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'car', primary_info: '前往羽黑山隨神門', secondary_info: '短程山路' }, details: { title: '前往聖域', content: '駕車前往鄰近的羽黑山。目標是山腳下的「隨神門」，也就是參道的入口處。' } } },
{ id: 974, date: '08/15', type: 'sight', name: '羽黑山 (五重塔)', timeStart: '10:40', timeEnd: '11:40', desc: '國寶五重塔', status: 'active', expenses: [], jp_name: '羽黒山五重塔', aiData: { category: 'activity', theme: 'blue', summary: { header: '國寶攝影', primary_info: '羽黑山 五重塔', location_keyword: 'Hagurosan Five-storied Pagoda', stay_time: '1hr', one_line_tip: '只拍塔不爬山，保留體力', tel: '0235-62-2355' }, details: { title: '杉林中的木造奇蹟', content: '穿越朱紅色的隨神門，步入樹齡數百年的杉木林參道，空氣瞬間變得莊嚴肅穆。步行約 10-15 分鐘即可抵達國寶「羽黑山五重塔」。這座純木造建築未用一根釘子，優雅地矗立在綠意中。本日策略是「只拍塔不爬山」，拍完即折返，將體力留給晚上的花火大會。', history: '傳說由平將門創建，現存塔身為約 600 年前重建，是東北地區最古老的塔，也是出羽三山信仰的象徵。', photo_advice: '利用參道兩旁的巨杉作為前景框架 (Framing)，引導視線至五重塔。陽光穿透樹葉形成的耶穌光是加分項。', must_list: ['必拍：國寶五重塔', '必看：爺杉 (千年巨木)', '體驗：過祓川紅橋'] } } },
{ id: 975, date: '08/15', type: 'transport', name: '移動：羽黑山 ➡ 拉麵', timeStart: '11:40', timeEnd: '12:00', desc: '前往午餐', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：20m', transport_mode: 'car', primary_info: '前往中華そば 琴の', secondary_info: '提早移動避開人潮' }, details: { title: '午餐衝刺', content: '趕在 12:00 前抵達拉麵店是關鍵。赤川花火當天，鶴岡市內的知名餐廳都會大排長龍。' } } },
{ id: 976, date: '08/15', type: 'food', name: '中華そば 琴の', timeStart: '12:00', timeEnd: '13:00', desc: '庄內拉麵名店', status: 'active', expenses: [], jp_name: '中華そば 琴の', aiData: { category: 'activity', theme: 'orange', summary: { header: '必吃午餐', primary_info: '中華そば 琴の', location_keyword: 'Chuka Soba Kotono', stay_time: '1hr', one_line_tip: '若排隊過長則改去 AEON', tel: '0235-24-3581' }, details: { title: '淡麗系的極致', content: '【美食分析】\n空間氛圍：由民宅改建的店面，溫馨且充滿在地感，是庄內地區極具代表性的排隊名店。\n味蕾報告：湯頭以「飛魚乾 (Ago-dashi)」與雞骨熬製，呈現清澈的金黃色，香氣優雅深邃。自家製的捲曲麵條吸附湯汁能力極佳，叉燒軟嫩入味。這是一碗能洗滌心靈的拉麵。\n點餐攻略：招牌「中華そば (中華拉麵)」加味玉 (溏心蛋)。若有「太麵 (粗麵)」選項強烈推薦嘗試。', must_eat: ['中華そば (あっさり)', '味付玉子', '叉燒飯'] } } },
{ id: 977, date: '08/15', type: 'transport', name: '移動：拉麵 ➡ 三川', timeStart: '13:00', timeEnd: '13:20', desc: '前往補給', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：20m', transport_mode: 'car', primary_info: '前往 AEON MALL 三川', secondary_info: '最後補給點' }, details: { title: '前往物資基地', content: '駕車前往會場附近的 AEON MALL 三川。這裡是進入花火管制區前最後的大型補給站。' } } },
{ id: 978, date: '08/15', type: 'sight', name: '補給：AEON MALL 三川', timeStart: '13:20', timeEnd: '14:15', desc: '戰備儲糧', status: 'active', expenses: [], jp_name: 'イオンモール三川', aiData: { category: 'logistics', theme: 'rose', summary: { header: '採買', primary_info: 'AEON MALL 三川', location_keyword: 'AEON MALL Mikawa', stay_time: '55m', one_line_tip: '買齊晚餐、飲料、冰塊', tel: '0235-68-1600' }, details: { title: '花火大會的生命線', content: '赤川花火會場周邊的攤販通常大排長龍且價格較高。請務必在此買齊晚餐（便當、壽司、炸雞）、足夠的水與運動飲料、以及消暑用的冰塊或冰涼貼片。超市內的熟食區是最佳選擇。如果有缺野餐墊或防蟲噴霧，這裡也能一次購足。', must_list: ['必買：晚餐便當', '必買：冰塊/凍飲', '必備：垃圾袋'] } } },
{ id: 979, date: '08/15', type: 'transport', name: '移動：AEON ➡ 會場', timeStart: '14:15', timeEnd: '14:30', desc: '回防', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '返回赤川花火會場', secondary_info: '14:30前務必抵達' }, details: { title: '最後衝刺', content: '14:30 之後，會場周邊將實施嚴格的交通管制，車輛可能無法進出。務必在此之前回到早上的停車位置或進入管制區內的停車場。這是一場與時間的賽跑。' } } },
{ id: 980, date: '08/15', type: 'hub', name: '休息：赤川花火會場', timeStart: '14:30', timeEnd: '16:00', desc: '避暑休息', status: 'active', expenses: [], jp_name: '赤川花火大会 会場', aiData: { category: 'hub', theme: 'hub', summary: { header: '待機', primary_info: '赤川花火會場 (北岸)', location_keyword: 'Akagawa Fireworks Venue', stay_time: '1hr 30m', one_line_tip: '在陰涼處或車上休息', tel: '0235-64-0701' }, details: { title: '抗熱作戰', content: '下午兩三點是氣溫最高的時候。回到佔位點後，再次確認腳架水平與構圖是否被移動。接著請躲在車上吹冷氣，或是尋找橋下的陰涼處休息。嚴防中暑是此刻最重要的任務，多喝水，保持體力迎接晚上的硬仗。' } } },
{ id: 981, date: '08/15', type: 'scouting', name: '待機：會場周邊', timeStart: '16:00', timeEnd: '19:15', desc: '攝影準備', status: 'active', expenses: [], jp_name: '撮影準備', aiData: { category: 'scouting', theme: 'cyan', summary: { header: '攝影', primary_info: '會場周邊漫步', location_keyword: 'Magic Hour', stay_time: '3hr 15m', one_line_tip: '拍攝人潮與夕陽色溫', photo_guide: '捕捉祭典氛圍' }, details: { title: '祭典的序曲', content: '隨著太陽西下，人潮逐漸湧現，穿著浴衣的觀眾讓會場充滿了夏日祭典的氛圍。這是拍攝人文題材的好時機。傍晚的 Magic Hour，天空呈現深藍色調，與地面的燈光形成對比，非常適合拍攝大會前的環境照。回到腳架旁，完成最後的相機設定（B快門、ISO 100、手動對焦無限遠）。' } } },
{ id: 982, date: '08/15', type: 'sight', name: '赤川花火大會', timeStart: '19:15', timeEnd: '21:00', desc: '日本四大花火', status: 'active', expenses: [], jp_name: '赤川花火大会', aiData: { category: 'activity', theme: 'blue', summary: { header: '實戰', primary_info: '第36回 赤川花火大會', location_keyword: 'Akagawa Fireworks', stay_time: '1hr 45m', one_line_tip: '700米超廣角花火', tel: '0235-64-0701' }, details: { title: '感動日本的設計花火', content: '赤川花火以其寬達 700 公尺的超廣角發射面聞名，被譽為「日本第一的設計花火」。與傳統花火不同，這裡強調音樂與花火的完美同步，視覺效果極具現代感與藝術性。壓軸的「市民花火」通常會用盡全力的齊射，讓視野內充滿光與色彩。專注拍攝之餘，別忘了用肉眼感受那份震動與感動。', history: '由赤川花火大會實行委員會主辦，憑藉著高品質的演出，躋身日本花火百選及四大花火之列。', photo_advice: '赤川的特色是橫向寬度極廣，務必使用廣角鏡頭 (14mm-24mm) 才能將全景收入。注意兩側的低空花火不要爆框。', must_list: ['必拍：超寬幅齊射', '必拍：Ending 花火', '體驗：音樂同步'] } } },
{ id: 983, date: '08/15', type: 'sight', name: '撤收：收拾與禮儀', timeStart: '21:00', timeEnd: '21:30', desc: '善後', status: 'active', expenses: [], jp_name: '撤収作業', aiData: { category: 'logistics', theme: 'rose', summary: { header: '撤收', primary_info: '場地復原', location_keyword: 'Cleanup', stay_time: '30m', one_line_tip: '垃圾帶走，檢查器材', tel: 'N/A' }, details: { title: '旅人的禮儀', content: '花火結束後，請迅速收拾腳架與攝影器材。最重要的是將所有產生的垃圾（便當盒、寶特瓶）全部帶走，不要留在河堤上。檢查地面是否有遺落鏡頭蓋或快門線。準備迎接今晚最後的挑戰——塞車。', must_list: ['任務：帶走垃圾', '檢查：鏡頭蓋/配件', '心態：保持耐心'] } } },
{ id: 984, date: '08/15', type: 'transport', name: '移動：赤川 ➡ 山形', timeStart: '21:30', timeEnd: '24:00', desc: '地獄塞車', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：2.5hr+', transport_mode: 'car', primary_info: '返回山形市區', secondary_info: '預期嚴重塞車' }, details: { title: '紅色的車尾燈河', content: '赤川花火的散場塞車是出名的。光是駛出停車場可能就需要 1 小時以上，回到山形市區可能已是深夜。請拿出車上預備的提神飲料與零食，播放喜歡的音樂，保持平和的心情。這段路是花火大會體驗的一部分。' } } },
{ id: 985, date: '08/15', type: 'hub', name: '休息：東橫INN 山形站西口', timeStart: '24:00', timeEnd: '24:00', desc: '深夜抵達', status: 'active', expenses: [], jp_name: '東横INN山形駅西口', aiData: { category: 'hub', theme: 'hub', summary: { header: '終點', primary_info: '東橫INN 山形站西口', location_keyword: 'Toyoko Inn Yamagata Station West', stay_time: 'Overnight', one_line_tip: '徹底休息', tel: '023-644-1045' }, details: { title: '戰士的休息', content: '辛苦了！終於回到飯店。今天經歷了酷熱、長途跋涉與數小時的等待，身體應該已經到達極限。快速洗澡後請立即就寢。這場花火的壯麗畫面，將會成為這趟旅程最難忘的回憶。' } } },


// --- Day 11: 2026/08/16 (藏王補考/秋保萩餅 -> 仙台古蹟與牛舌) ---
{ id: 986, date: '08/16', type: 'hub', name: '退房：東橫INN 山形站西口', timeStart: '07:00', timeEnd: '07:15', desc: 'Check-out', status: 'active', expenses: [], jp_name: '東横INN山形駅西口', aiData: { category: 'hub', theme: 'hub', summary: { header: '出發', primary_info: '東橫INN 山形站西口', location_keyword: 'Toyoko Inn Yamagata Station West', stay_time: '15m', one_line_tip: '檢查車內遺留物品', tel: '023-644-1045' }, details: { title: '告別山形', content: '早安，山形。辦理退房手續，並進行最後一次車內檢查。椅縫間的零錢、門邊的寶特瓶、後座的雨傘，請確保沒有任何遺漏。今天將跨越縣界返回仙台，也是自駕行程的最後一天。' } } },

// --- PLAN A: 藏王御釜 (補考路線) ---
{ id: 987, date: '08/16', type: 'transport', name: '移動：山形 ➡ 御釜', timeStart: '07:15', timeEnd: '08:30', desc: '藏王Echo Line', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr 15m', transport_mode: 'car', primary_info: '經由藏王 Echo Line', secondary_info: '早晨山區易起霧' }, details: { title: '再戰藏王', content: '這是為了彌補 8/13 未能見到御釜真面目的補考路線。清晨的山形側 Echo Line 車流較少，空氣清新。山區早晨容易起霧，請開啟霧燈並小心駕駛。' } } },
{ id: 988, date: '08/16', type: 'sight', name: '藏王御釜 (Okama)', timeStart: '08:30', timeEnd: '10:30', desc: '深度攝影', status: 'active', plan: 'A', expenses: [], jp_name: '蔵王の御釜', aiData: { category: 'activity', theme: 'blue', summary: { header: '絕景補考', primary_info: '蔵王の御釜', location_keyword: 'Zao Okama', stay_time: '2hr', one_line_tip: '早晨光線立體感最佳', tel: '0224-34-2725' }, details: { title: '翡翠色的晨光', content: '早晨 8:30 是拍攝御釜的黃金時段。此時太陽角度較低，能照亮湖面呈現深邃的翡翠綠，同時勾勒出火山口岩壁的立體感。運氣好的話，還能遇見漫過山脊的雲海。利用這 2 小時深度走訪刈田岳山頂神社，並尋找不同的前景構圖。記得，山頂氣溫比平地低 10 度以上，防風外套是標配。', history: '藏王連峰的象徵，是 3000 年前火山爆發形成的火口湖。', photo_advice: '利用廣角鏡帶入天空的雲彩，或用長焦特寫湖水的漸層色。', must_list: ['必拍：御釜全景', '必訪：刈田嶺神社', '必備：防風衣物'] } } },
{ id: 989, date: '08/16', type: 'transport', name: '移動：御釜 ➡ 仙台', timeStart: '10:30', timeEnd: '12:00', desc: '前往還車', status: 'active', plan: 'A', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr 30m', transport_mode: 'car', primary_info: '前往仙台東口', secondary_info: '長距離下坡' }, details: { title: '告別群山', content: '從藏王下山，經由高速公路前往仙台市區。這段路程較長，請保持專注。目標是仙台車站東口的加油站，準備與 Plan B 路線匯合。' } } },

// --- PLAN B: 秋保絕景 (療癒路線) ---
{ id: 990, date: '08/16', type: 'transport', name: '移動：山形 ➡ 秋保', timeStart: '07:15', timeEnd: '08:15', desc: '前往瀑布', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr', transport_mode: 'car', primary_info: '前往秋保大瀑布', secondary_info: '經由二口林道/國道' }, details: { title: '穿越縣境', content: '如果 8/13 已經看過御釜，今天就走療癒路線。前往仙台市郊的秋保溫泉區，沿途綠意盎然。' } } },
{ id: 991, date: '08/16', type: 'sight', name: '秋保大瀑布', timeStart: '08:15', timeEnd: '09:15', desc: '日本三名瀑', status: 'active', plan: 'B', expenses: [], jp_name: '秋保大滝', aiData: { category: 'activity', theme: 'blue', summary: { header: '負離子', primary_info: '秋保大滝', location_keyword: 'Akiu Great Falls', stay_time: '1hr', one_line_tip: '早晨遊客少，可下至瀧壺', tel: '022-398-2323' }, details: { title: '晨間的轟鳴', content: '早晨 8 點多的秋保大瀑布遊客稀少，您可以獨享這份壯闊。沿著步道下行至瀑布底部的「瀧壺」，近距離感受 55 公尺落差帶來的震撼水霧。在陽光照射下，飛濺的水珠經常會形成彩虹，是攝影的絕佳時機。', history: '日本三名瀑之一，也是國家指定名勝。', photo_advice: '嘗試使用高速快門凝結水珠，或慢速快門拍攝絲絹感。如有彩虹，請使用偏光鏡 (CPL) 增強色彩。', must_list: ['必拍：瀧壺彩虹', '必訪：不動尊', '注意：階梯濕滑'] } } },
{ id: 992, date: '08/16', type: 'transport', name: '移動：瀑布 ➡ 溫泉街', timeStart: '09:15', timeEnd: '09:35', desc: '短程移動', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：20m', transport_mode: 'car', primary_info: '前往秋保溫泉街', secondary_info: '目標：主婦の店 さいち' }, details: { title: '前往傳說超市', content: '驅車前往秋保溫泉街中心。目標不是溫泉，而是一家傳說中的超市。' } } },
{ id: 993, date: '08/16', type: 'food', name: 'さいち (Saichi) & 磊磊峽', timeStart: '09:35', timeEnd: '11:00', desc: '必吃萩之餅', status: 'active', plan: 'B', expenses: [], jp_name: '主婦の店 さいち', aiData: { category: 'activity', theme: 'orange', summary: { header: '名物搶購', primary_info: '主婦の店 さいち', location_keyword: 'Shufu no Mise Saichi', stay_time: '1hr 25m', one_line_tip: '必買秋保萩之餅 (Ohagi)', tel: '022-398-2101' }, details: { title: '一天賣五千個的傳奇', content: '這看似普通的超市，卻有著全日本知名的「秋保萩之餅 (Ohagi)」。紅豆泥甜度適中，帶有微鹹的餘韻，包裹著軟糯的糯米，是讓人一吃就上癮的魔性甜點。買好萩之餅後，步行至後方的「磊磊峽」，一邊欣賞奇岩怪石與「愛心石穴」，一邊享用這份道地的日式早茶。', must_eat: ['秋保萩之餅(紅豆)', '秋保萩之餅(芝麻)', '惣菜(熟食)'] } } },
{ id: 994, date: '08/16', type: 'transport', name: '移動：秋保 ➡ 仙台', timeStart: '11:00', timeEnd: '12:00', desc: '前往市區', status: 'active', plan: 'B', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：1hr', transport_mode: 'car', primary_info: '前往仙台東口', secondary_info: '預留緩衝時間' }, details: { title: '返回都會', content: '帶著滿足的胃口，駕車返回仙台市區。這段時間預留了較多緩衝，以防市區塞車。目標是仙台車站東口。' } } },

// --- 共同行程 (仙台還車與市區觀光) ---
{ id: 995, date: '08/16', type: 'sight', name: '加油：ENEOS 仙台東口', timeStart: '12:00', timeEnd: '12:15', desc: '滿油還車', status: 'active', expenses: [], jp_name: 'ENEOS Dr.Drive 仙台駅東口店', aiData: { category: 'logistics', theme: 'rose', summary: { header: '加油', primary_info: 'ENEOS Dr.Drive 仙台駅東口店', location_keyword: 'ENEOS Sendai East', stay_time: '15m', one_line_tip: '加滿 Regular，保留收據', tel: '022-256-2551' }, details: { title: '最後的自駕任務', content: '在還車前，務必將油箱加滿。這家 ENEOS 距離 ORIX 非常近，位置方便。請加滿 Regular (紅色油槍) 並妥善保管收據，這是還車時的必要文件。', must_list: ['任務：加滿油', '任務：收好收據', '任務：丟棄車內垃圾'] } } },
{ id: 996, date: '08/16', type: 'transport', name: '移動：加油站 ➡ ORIX', timeStart: '12:15', timeEnd: '12:20', desc: '前往還車', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：5m', transport_mode: 'car', primary_info: '前往 ORIX 仙台東口', secondary_info: '就在附近' }, details: { title: '歸還', content: '行駛至附近的 ORIX 租車點。' } } },
{ id: 997, date: '08/16', type: 'sight', name: '還車：ORIX 仙台東口', timeStart: '12:20', timeEnd: '12:30', desc: '還車手續', status: 'active', expenses: [], jp_name: 'オリックスレンタカー仙台駅東口店', aiData: { category: 'logistics', theme: 'rose', summary: { header: '還車', primary_info: 'ORIX 租車 仙台東口店', location_keyword: 'ORIX Rent-A-Car Sendai East', stay_time: '10m', one_line_tip: '檢查 ETC 卡是否拔除', tel: '022-291-0543' }, details: { title: '無車一身輕', content: '完成還車手續。請進行最後一次「地毯式搜索」，確保手機架、傳輸線、太陽眼鏡以及最重要的 ETC 卡都有帶走。感謝這台車陪伴我們征服了藏王與山形的山路。', must_list: ['檢查：ETC卡', '檢查：門邊置物格', '檢查：後車廂'] } } },
{ id: 998, date: '08/16', type: 'transport', name: '移動：ORIX ➡ 飯店', timeStart: '12:30', timeEnd: '12:45', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'walk', primary_info: '前往東橫INN 仙台東口1號', secondary_info: '步行回飯店' }, details: { title: '物流鏈結', content: '拖著行李步行至今晚的住宿點：東橫INN 仙台東口1號。路程不遠，可以慢慢走。' } } },
{ id: 999, date: '08/16', type: 'hub', name: '寄物：東橫INN 仙台東口', timeStart: '12:45', timeEnd: '13:00', desc: '寄放行李', status: 'active', expenses: [], jp_name: '東横INN仙台東口1号館', aiData: { category: 'logistics', theme: 'rose', summary: { header: '寄物', primary_info: '東橫INN 仙台東口1號', location_keyword: 'Toyoko Inn Sendai East Exit 1', stay_time: '15m', one_line_tip: '寄放行李，輕裝出發', tel: '022-298-1045' }, details: { title: '輕裝上陣', content: '雖然還沒到 Check-in 時間，先將大件行李寄放在櫃台。現在開始，我們將切換為「步行 + 大眾運輸」的仙台市區遊覽模式。帶上相機與錢包即可。' } } },
{ id: 1000, date: '08/16', type: 'transport', name: '移動：飯店 ➡ 牛舌', timeStart: '13:00', timeEnd: '13:30', desc: '穿越車站', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'walk', primary_info: '前往西口名掛丁店', secondary_info: '穿越東西自由通路' }, details: { title: '穿越杜之都', content: '從東口穿越仙台車站巨大的「東西自由通路」前往西口。沿途可以感受仙台作為東北第一大城的繁華與活力。目標是位於名掛丁商店街附近的牛舌名店。' } } },
{ id: 1001, date: '08/16', type: 'food', name: '[主案] 牛舌專門店 司', timeStart: '13:30', timeEnd: '15:00', desc: '熟成牛舌', status: 'active', plan: 'Main', expenses: [], jp_name: '牛タン焼専門店 司 西口名掛丁店', aiData: { category: 'activity', theme: 'orange', summary: { header: '必吃牛舌', primary_info: '牛タン焼専門店 司 西口名掛丁店', location_keyword: 'Gyutan Tsukasa West', stay_time: '1hr 30m', one_line_tip: '推薦熟成牛舌定食', tel: '022-797-0229' }, details: { title: '極致的厚切口感', content: '【美食分析】\n空間氛圍：店內充滿炭火香氣，雖然是人氣店但翻桌率算快。選擇 13:30 用餐是為了避開上班族的午餐尖峰。\n味蕾報告：「司」的特色在於選用澳洲產的高級牛舌品牌，經過熟成處理，炭火烤製後外焦內嫩，保有驚人的厚度卻能輕易咬斷。那種在口中爆發的肉汁與炭香，是仙台牛舌的標竿。\n點餐攻略：必點「牛タン定食 (牛舌定食)」，搭配麥飯與山藥泥 (Tororo) 是最道地的吃法。', must_eat: ['熟成牛舌定食', '燉煮牛舌 (Tou)', '麥飯加山藥泥'] } } },
{ id: 1002, date: '08/16', type: 'food', name: '[備案] 旨味太助', timeStart: '13:30', timeEnd: '15:00', desc: '牛舌發源地', status: 'active', plan: 'Backup', expenses: [], jp_name: '旨味太助', aiData: { category: 'activity', theme: 'orange', summary: { header: '元祖之味', primary_info: '旨味太助', location_keyword: 'Umami Tasuke', stay_time: '1hr 30m', one_line_tip: '體驗最原始的牛舌風味', tel: '022-262-2539' }, details: { title: '傳承的鹽味', content: '如果不去「司」，這家「旨味太助」是牛舌料理的發源地之一（佐野啟四郎的弟子開店）。這裡保留了最傳統的風格，只提供鹽味牛舌。口感較有嚼勁，充滿野性與炭火的焦香味，配上清爽的牛尾湯，是老饕們心中的經典。', must_eat: ['牛舌定食A', '牛尾湯'] } } },
{ id: 1003, date: '08/16', type: 'transport', name: '移動：餐廳 ➡ 瑞鳳殿', timeStart: '15:00', timeEnd: '15:15', desc: '搭計程車', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：15m', transport_mode: 'car', primary_info: '搭計程車前往瑞鳳殿', secondary_info: '趕閉館時間' }, details: { title: '交通修正', content: '瑞鳳殿通常 16:50 閉館（最後入場 16:30）。為了確保有足夠的參觀時間，且避免 Loople 仙台觀光巴士繞路或客滿，強烈建議直接攔計程車前往。這點小錢能換來寶貴的 45 分鐘參觀時間，絕對值得。' } } },
{ id: 1004, date: '08/16', type: 'sight', name: '瑞鳳殿 (Zuihoden)', timeStart: '15:15', timeEnd: '16:30', desc: '伊達政宗靈廟', status: 'active', expenses: [], jp_name: '瑞鳳殿', aiData: { category: 'activity', theme: 'blue', summary: { header: '歷史建築', primary_info: '瑞鳳殿', location_keyword: 'Zuihoden', stay_time: '1hr 15m', one_line_tip: '拍攝桃山樣式的絢爛色彩', tel: '022-262-6250' }, details: { title: '獨眼龍的長眠之地', content: '這裡是仙台藩祖伊達政宗的靈廟。建築風格承襲了桃山文化的華麗與絢爛，色彩鮮豔的木雕與金箔裝飾，在周圍高聳杉木林的深綠色襯托下，顯得格外耀眼。爬上一小段石階後，那種莊嚴與華美並存的氛圍會讓人屏息。', history: '原建築在二戰中燒毀，現存建築是依照原樣重建的，完美重現了當年的輝煌。', photo_advice: '拍攝屋簷下的斗拱與色彩細節。參道兩旁的杉木林利用長焦壓縮，可以拍出深邃的引導線。', must_list: ['必看：涅槃門', '必拍：本殿色彩', '體驗：杉林參道'] } } },
{ id: 1005, date: '08/16', type: 'transport', name: '移動：瑞鳳殿 ➡ 青葉城', timeStart: '16:30', timeEnd: '17:00', desc: '計程車/巴士', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'public', primary_info: '前往青葉城跡', secondary_info: '建議計程車較省力' }, details: { title: '攻頂青葉山', content: '從瑞鳳殿前往青葉城跡（仙台城跡）。雖然有 Loople 巴士，但班次間隔較長，若有多人共乘，計程車依然是效率首選。目標是山頂的伊達政宗騎馬像。' } } },
{ id: 1006, date: '08/16', type: 'sight', name: '青葉城跡 (伊達政宗像)', timeStart: '17:00', timeEnd: '18:30', desc: '俯瞰仙台夜景', status: 'active', expenses: [], jp_name: '仙台城跡 (青葉城址)', aiData: { category: 'activity', theme: 'blue', summary: { header: '百萬夜景', primary_info: '仙台城跡 (青葉城址)', location_keyword: 'Sendai Castle Site', stay_time: '1hr 30m', one_line_tip: '拍攝政宗公騎馬像剪影', tel: '022-222-0218' }, details: { title: '獨眼龍的天下', content: '雖然天守閣已不復存在，但站在高台之上，你可以擁有與當年伊達政宗相同的視角，俯瞰整個仙台市區與太平洋。黃昏時刻 (Magic Hour) 是這裡最美的瞬間，天空的藍調與市區點點燈光相互輝映。伊達政宗騎馬像的剪影更是仙台最經典的畫面。', history: '由伊達政宗建造的天然要塞，位於青葉山頂，易守難攻。', photo_advice: '利用廣角鏡頭拍攝政宗像與背後的仙台市景。夜景部分建議使用腳架，快門速度放慢以獲得純淨畫質。', must_list: ['必拍：騎馬像剪影', '必看：仙台夜景', '必吃：毛豆泥奶昔'] } } },
{ id: 1007, date: '08/16', type: 'transport', name: '移動：青葉城 ➡ 購物', timeStart: '18:30', timeEnd: '19:00', desc: '下山', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'public', primary_info: '前往仙台站周邊', secondary_info: '巴士或計程車' }, details: { title: '重返繁華', content: '搭乘巴士或計程車下山，前往青葉通或一番町的商店街區域。晚餐前是最後的購物衝刺時間。' } } },
{ id: 1008, date: '08/16', type: 'sight', name: '購物：仙台商店街/S-PAL', timeStart: '19:00', timeEnd: '20:30', desc: '掃貨時間', status: 'active', expenses: [], jp_name: '仙台駅周辺', aiData: { category: 'activity', theme: 'blue', summary: { header: '購物', primary_info: '仙台商店街 / S-PAL', location_keyword: 'Sendai Shopping', stay_time: '1hr 30m', one_line_tip: '藥妝店與土產採買', tel: 'N/A' }, details: { title: '東北最大購物區', content: '把握晚餐前的時間採買。仙台車站直結的 S-PAL (本館/東館) 營業至 20:00 或 21:00，這裡有豐富的東北土產與雜貨。若需要藥妝，可以前往車站前的商店街（如 Hapina 名掛丁）。這是補齊伴手禮的最佳機會。', must_list: ['必買：萩之月', '必買：牛舌辣油', '必買：毛豆泥甜點'] } } },
{ id: 1009, date: '08/16', type: 'food', name: '蔵の庄 花京院通本店', timeStart: '20:30', timeEnd: '22:00', desc: '圍爐裏燒與芹菜鍋', status: 'active', expenses: [], jp_name: '蔵の庄 花京院通本店', aiData: { category: 'activity', theme: 'orange', summary: { header: '特色晚餐', primary_info: '蔵の庄 花京院通本店', location_keyword: 'Kura no Sho', stay_time: '1hr 30m', one_line_tip: '必點仙台芹菜鍋 (Seri Nabe)', tel: '022-224-2611' }, details: { title: '圍爐裏的溫暖', content: '【美食分析】\n空間氛圍：店內設有巨大的圍爐裏 (Irori)，烤魚與蔬菜在炭火旁慢慢燻烤，視覺與嗅覺的雙重享受。氣氛熱鬧且充滿在地風情。\n味蕾報告：必點仙台名物「芹菜鍋 (Seri Nabe)」。連根部一起煮的芹菜口感爽脆，帶有獨特的清香，能吸附鴨肉湯底的精華。炭火燒烤的時令蔬菜與魚鮮也是一絕。\n點餐攻略：仙台芹菜鍋、圍爐裏燒魚、天婦羅。', must_eat: ['仙台芹菜鍋', '圍爐裏烤魚', '炸天婦羅'] } } },
{ id: 1010, date: '08/16', type: 'food', name: '甜點：喜久水庵', timeStart: '22:00', timeEnd: '22:30', desc: '毛豆泥奶昔', status: 'active', expenses: [], jp_name: '喜久水庵 ずんだ茶屋', aiData: { category: 'activity', theme: 'orange', summary: { header: '完美句點', primary_info: '喜久水庵 ずんだ茶屋', location_keyword: 'Kikusuian Zunda', stay_time: '30m', one_line_tip: '必喝 Zunda Shake', tel: 'N/A' }, details: { title: '仙台的味道', content: '雖然晚餐吃很飽，但甜點是另一個胃。在車站內的喜久水庵買一杯「Zunda Shake (毛豆泥奶昔)」。濃郁的毛豆香氣與奶昔的滑順口感完美融合，還吃得到微微的顆粒感。這是來仙台絕對不能錯過的儀式感。', must_eat: ['Zunda Shake'] } } },
{ id: 1011, date: '08/16', type: 'transport', name: '移動：車站 ➡ 飯店', timeStart: '22:30', timeEnd: '23:00', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：30m', transport_mode: 'walk', primary_info: '返回東橫INN', secondary_info: '散步消化' }, details: { title: '歸途', content: '手裡拿著奶昔，散步穿越車站回到東口。夜晚的仙台涼爽宜人。' } } },
{ id: 1012, date: '08/16', type: 'hub', name: '休息：東橫INN 仙台東口', timeStart: '23:00', timeEnd: '23:30', desc: '休息', status: 'active', expenses: [], jp_name: '東横INN仙台東口1号館', aiData: { category: 'hub', theme: 'hub', summary: { header: '終點', primary_info: '東橫INN 仙台東口1號', location_keyword: 'Toyoko Inn Sendai East Exit 1', stay_time: 'Overnight', one_line_tip: '整理戰利品', tel: '022-298-1045' }, details: { title: '旅程倒數', content: '回到飯店，領取寄放的行李。今晚需要稍微花點時間整理戰利品與行李，因為明天就要準備搭機返台了。看著相機裡滿滿的照片，這趟從山梨到東北的旅程回憶無比珍貴。晚安。' } } },


// --- Day 12: 2026/08/17 (仙台大觀音巴士攻略、壽司與返程) ---
{ id: 1013, date: '08/17', type: 'hub', name: '退房：東橫INN 仙台東口1號', timeStart: '07:15', timeEnd: '07:30', desc: 'Check-out', status: 'active', expenses: [], jp_name: '東横INN仙台東口1号館', aiData: { category: 'hub', theme: 'hub', summary: { header: '起點', primary_info: '東橫INN 仙台東口1號', location_keyword: 'Toyoko Inn Sendai East Exit 1', stay_time: '15m', one_line_tip: '寄放行李，提早出發搭巴士', tel: '022-298-1045' }, details: { title: '巴士特攻隊', content: '早安仙台。為了配合巴士時刻表，建議提早一點辦理退房。將所有大型行李寄放在飯店大廳後，帶著輕便裝備出發。因為要去西口搭巴士，所以動作要快一點。' } } },
{ id: 1014, date: '08/17', type: 'transport', name: '移動：飯店 ➡ 西口巴士站', timeStart: '07:30', timeEnd: '07:50', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：20m', transport_mode: 'walk', primary_info: '前往仙台站西口巴士總站', secondary_info: '穿越東西自由通路' }, details: { title: '穿越車站', content: '從東口飯店步行穿越仙台車站的「東西自由通路」，前往西口地面的「西口巴士總站 (West Exit Bus Pool)」。目標是 14 號乘車處。' } } },
{ id: 1015, date: '08/17', type: 'hub', name: '巴士：西口 14 號站牌', timeStart: '07:50', timeEnd: '08:00', desc: '候車', status: 'active', expenses: [], jp_name: '仙台駅西口バスプール 14番', aiData: { category: 'hub', theme: 'hub', summary: { header: '候車', primary_info: '西口巴士總站 14號乘車處', location_keyword: 'Sendai Station West Bus Pool Stop 14', stay_time: '10m', one_line_tip: '搭乘 815/825 系統', tel: 'N/A' }, details: { title: '確認班次', content: '在 14 號乘車處排隊。目標是搭乘 07:55 或 08:00 左右發車的仙台市營巴士（往西中山或泉 Village 方向）。請確認車頭顯示「仙台大観音」或經由相關路線。' } } },
{ id: 1016, date: '08/17', type: 'transport', name: '移動：仙台 ➡ 大觀音', timeStart: '08:00', timeEnd: '08:45', desc: '市營巴士', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：45m', transport_mode: 'bus', primary_info: '仙台市營巴士', secondary_info: '仙台大観音前 下車' }, details: { title: '前往住宅區的巨像', content: '搭乘巴士前往市郊。隨著車輛駛離市中心，遠遠就能看到白色的巨大身影出現在住宅區的屋頂之上，那種視覺衝擊非常強烈。車程約 40-45 分鐘，請留意車內廣播，在「仙台大觀音前」下車。' } } },
{ id: 1017, date: '08/17', type: 'sight', name: '仙台大觀音 (大觀密寺)', timeStart: '08:45', timeEnd: '09:45', desc: '巨型觀音像', status: 'active', expenses: [], jp_name: '仙台大観音', aiData: { category: 'activity', theme: 'blue', summary: { header: '視覺衝擊', primary_info: '仙台大觀音', location_keyword: 'Sendai Daikannon', stay_time: '1hr', one_line_tip: '拍攝住宅區中的巨大身影', tel: '022-278-3331' }, details: { title: '凝視眾生的巨像', content: '高達 100 公尺的純白觀音像矗立在住宅區中，是仙台獨有的超現實風景。早晨的光線柔和，適合拍攝觀音像潔白的質感。建議在下車處附近的街道尋找構圖，利用長焦鏡頭壓縮前景的電線桿、民宅與後方的巨像，營造出強烈的「日常 vs 神聖」反差感。若有時間也可購票進入觀音體內參觀。', history: '為了紀念仙台市制 100 周年而建，高度 100 公尺象徵著這份紀念，地下深度 21 公尺則代表對 21 世紀的繁榮祈願。', photo_advice: '推薦在鄰近的街道上使用長焦鏡頭 (70-200mm) 拍攝，捕捉觀音像從民宅後方探出頭的震撼畫面。', must_list: ['必拍：街景中的觀音', '必看：體內登頂展望', '必備：長焦鏡頭'] } } },
{ id: 1018, date: '08/17', type: 'transport', name: '移動：大觀音 ➡ 仙台站', timeStart: '09:45', timeEnd: '10:35', desc: '市營巴士', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：50m', transport_mode: 'bus', primary_info: '返回仙台車站', secondary_info: '對面站牌搭車' }, details: { title: '返回核心區', content: '走到對面的巴士站牌，搭乘返回仙台車站的班次。早上的通勤尖峰已過，但回程車流可能會稍多，預留約 50 分鐘的交通時間。' } } },
{ id: 1019, date: '08/17', type: 'sight', name: '購物：S-PAL 仙台', timeStart: '10:35', timeEnd: '11:10', desc: '最後掃貨', status: 'active', expenses: [], jp_name: 'エスパル仙台', aiData: { category: 'activity', theme: 'blue', summary: { header: '採買', primary_info: 'S-PAL 仙台', location_keyword: 'S-PAL Sendai', stay_time: '35m', one_line_tip: '購買需冷藏特產', tel: '022-267-2111' }, details: { title: '東北特產集散地', content: '抵達仙台站後，直接前往直結的 S-PAL 地下街。這裡是購買東北特產的寶庫。利用這段時間集中採購那些保質期較短或需要冷藏的美食，例如仙台名物「毛豆麻糬 (Zunda Mochi)」或是各式的漬物。這裡的店家通常提供保冷劑，適合在搭機前購入。', must_list: ['必買：毛豆麻糬', '必買：紫蘇捲', '必買：笹魚板'] } } },
{ id: 1020, date: '08/17', type: 'food', name: '仙令鮨 (Senrei Sushi)', timeStart: '11:10', timeEnd: '12:30', desc: '站內高分壽司', status: 'active', expenses: [], jp_name: '仙令鮨 JR仙台駅 3階店', aiData: { category: 'activity', theme: 'orange', summary: { header: '必吃午餐', primary_info: '仙令鮨 JR仙台駅 3階店', location_keyword: 'Senrei Sushi 3F', stay_time: '1hr 20m', one_line_tip: '避開正午人潮', tel: '022-214-6180' }, details: { title: '三陸海鮮的送別禮', content: '【美食分析】\n空間氛圍：位於車站 3 樓壽司通內的名店（原名北辰鮨），座位不多，通常大排長龍。11:10 左右抵達或許需要稍作等待，但翻桌率快。\n味蕾報告：主打氣仙沼與三陸海岸直送的新鮮漁獲。油脂豐富的鮪魚中腹、鮮甜的活扇貝、以及口感彈牙的比目魚緣側，每一貫都展現了東北海鮮的強大實力。醋飯溫度控制得宜，與魚料完美融合。\n點餐攻略：推薦直接點「特上握壽司套餐」，再一次性品嚐所有當季精華。', must_eat: ['特上握壽司', '鮪魚中腹', '今日推薦白身魚'] } } },
{ id: 1021, date: '08/17', type: 'sight', name: '購物：站內伴手禮', timeStart: '12:30', timeEnd: '12:50', desc: '收尾採買', status: 'active', expenses: [], jp_name: '仙台駅 おみやげ処', aiData: { category: 'activity', theme: 'blue', summary: { header: '補貨', primary_info: '仙台車站 伴手禮區', location_keyword: 'Sendai Station Souvenirs', stay_time: '20m', one_line_tip: '萩之月與 Zunda Shake', tel: 'N/A' }, details: { title: '最後的儀式感', content: '在離開車站前，進行最後一波補貨。著名的「萩之月 (Hagi no Tsuki)」是送禮首選。離開前，別忘了再來一杯喜久水庵的「Zunda Shake (毛豆泥奶昔)」，用這獨特的香甜滋味為仙台之旅畫下句點。', must_list: ['必買：萩之月', '必喝：Zunda Shake', '必買：牛舌餅乾'] } } },
{ id: 1022, date: '08/17', type: 'transport', name: '移動：西口 ➡ 東口飯店', timeStart: '12:50', timeEnd: '13:00', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'walk', primary_info: '返回東橫INN', secondary_info: '穿越車站' }, details: { title: '取回行李', content: '穿越仙台車站的東西自由通路，步行返回東口的東橫INN。' } } },
{ id: 1023, date: '08/17', type: 'sight', name: '後勤：領取行李', timeStart: '13:00', timeEnd: '13:10', desc: '領取行李', status: 'active', expenses: [], jp_name: '東横INN仙台東口1号館', aiData: { category: 'logistics', theme: 'rose', summary: { header: '領取行李', primary_info: '東橫INN 仙台東口1號', location_keyword: 'Toyoko Inn Luggage', stay_time: '10m', one_line_tip: '整理隨身行李', tel: '022-298-1045' }, details: { title: '整裝出發', content: '在飯店大廳領取早上寄放的行李。將剛剛採買的戰利品塞入行李箱或整理成好攜帶的狀態，準備前往機場。' } } },
{ id: 1024, date: '08/17', type: 'transport', name: '移動：飯店 ➡ 車站', timeStart: '13:10', timeEnd: '13:20', desc: '步行', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：10m', transport_mode: 'walk', primary_info: '前往 JR 仙台站', secondary_info: '拖行李移動' }, details: { title: '前往月台', content: '拖著行李前往 JR 仙台站。進入改札口，依照指標前往「仙台空港アクセス線」的月台。' } } },
{ id: 1025, date: '08/17', type: 'hub', name: '購票：JR 仙台站', timeStart: '13:20', timeEnd: '13:25', desc: '購票', status: 'active', expenses: [], jp_name: 'JR 仙台駅', aiData: { category: 'hub', theme: 'hub', summary: { header: '購票', primary_info: 'JR 仙台站 售票機', location_keyword: 'JR Sendai Station Ticket', stay_time: '5m', one_line_tip: '使用 IC 卡或現金購票', tel: 'N/A' }, details: { title: '機場線', content: '購買前往仙台機場的車票，或直接使用 Suica/ICOCA 進站。' } } },
{ id: 1026, date: '08/17', type: 'transport', name: '移動：仙台 ➡ 機場', timeStart: '13:25', timeEnd: '13:45', desc: 'JR 機場線', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '移動：25m', transport_mode: 'train', primary_info: 'JR 仙台機場線', secondary_info: '快速列車' }, details: { title: '最後一段鐵路', content: '搭乘 JR 仙台機場線 (Sendai Airport Access Line)。目標是搭上快速列車，約 25 分鐘即可抵達機場。請務必掌握時間，這是回家的關鍵班次。' } } },
{ id: 1027, date: '08/17', type: 'hub', name: '報到：仙台機場 (SDJ)', timeStart: '13:45', timeEnd: '15:00', desc: '登機手續', status: 'active', expenses: [], jp_name: '仙台空港', aiData: { category: 'hub', theme: 'hub', summary: { header: '報到', primary_info: '仙台機場 (SDJ)', location_keyword: 'Sendai Airport', stay_time: '1hr 15m', one_line_tip: '國際線櫃台報到', tel: '022-382-0080' }, details: { title: '再會東北', content: '抵達仙台機場後，直接前往國際線櫃台辦理長榮航空 BR117 的登機手續。托運行李，通過安檢與移民官。仙台機場規模不大，但動線流暢。如果有剩餘的日幣硬幣，可以在管制區內的販賣機或免稅店花掉。準備登機，帶著滿滿的回憶返回溫暖的家。' } } },
{ id: 1028, date: '08/17', type: 'transport', name: '航班：BR117', timeStart: '15:00', timeEnd: '18:00', desc: '返台', status: 'active', expenses: [], aiData: { category: 'transport', theme: 'gray', summary: { header: '飛行', transport_mode: 'plane', primary_info: '長榮航空 BR117', secondary_info: 'SDJ -> TPE' }, details: { title: '空中旅程', content: '搭乘長榮航空返回台北。在機上享用飛機餐，回味這 12 天從山梨花火到東北絕景的精彩旅程。辛苦了！' } } },









];

const FLIGHT_INFO = {
  outbound: {
    flight: 'MM860',
    date: '2026/08/05',
    time: '20:25 - 00:45',
    from: 'TPE',
    to: 'HND',
  },
  inbound: {
    flight: 'TBD',
    date: '2026/08/13',
    time: '--:--',
    from: 'SDJ',
    to: 'TPE',
  },
};

const ACCOMMODATION_LIST = [
  {
    date: '08/06',
    name: '東橫INN 甲府站南口1號',
    price: '¥8,360',
    note: '花火前夜',
  },
  { date: '08/07', name: '夜間巴士 (車上)', price: '-', note: '往京都' },
  {
    date: '08/08',
    name: '京都八條口相鐵弗雷薩',
    price: '¥10,933',
    note: '琵琶湖花火',
  },
  {
    date: '08/09',
    name: '京都八條口相鐵弗雷薩',
    price: '¥10,933',
    note: '京都巡禮',
  },
  {
    date: '08/10',
    name: '東橫INN 福井站前',
    price: '¥8,000',
    note: '福井工藝',
  },
  {
    date: '08/11',
    name: '東橫INN 福井站前',
    price: '¥8,000',
    note: '三國花火',
  },
  { date: '08/12', name: '仙台市區飯店', price: '¥9,000', note: '移動至東北' },
];

// --- UI 組件定義 ---

const Modal = ({ isOpen, onClose, children, bgColor = 'bg-white' }) => {
  if (!isOpen) return null;
  return (
    // 使用 CSS transition 實現動畫
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      <div
        className={`${bgColor} rounded-3xl w-full max-w-md max-h-[85vh] shadow-2xl relative transition-transform duration-300 border border-white/20 flex flex-col overflow-hidden`}
        style={{ transform: isOpen ? 'scale(1)' : 'scale(0.95)' }}
      >
        {/* 獨立的關閉按鈕區域 (Fixed Header inside Modal) */}
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/50 hover:bg-white/80 text-gray-600 transition-all backdrop-blur-md border border-gray-200/50 shadow-sm hover:shadow-md active:scale-95 flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        {/* 可滾動的內容區域 */}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};

// **修正 1 & 3:** 更新 Card 組件
const Card = ({
  item,
  onDelete,
  onEdit,
  openAiModal,
  openExpenseModal,
  isDeletedSection = false,
  onRestore,
}) => {
  const aiData = item.aiData || {};
  const summary = aiData.summary || {};
  const category = aiData.category || 'activity';
  const isTransport = category === 'transport';
  const isHub = category === 'hub';
  const isLogistics = category === 'logistics';
  const isScouting = category === 'scouting';
  const isFood = item.type === 'food';
  const isSight =
    item.type === 'sight' ||
    item.type === 'logistics' ||
    item.type === 'scouting';

  // **修正: 場勘卡改為 Cyan (天青色)，並適配文字顏色**
  const getStyle = () => {
    if (isScouting)
      return {
        bg: 'bg-cyan-50',
        border: 'border-cyan-200',
        text: 'text-cyan-900',
        icon: 'text-cyan-600',
        buttonBg: 'bg-cyan-800',
        buttonColorHex: '#06B6D4',
        accent: 'bg-cyan-100',
        note_bg: 'bg-white',
        note_text: 'text-cyan-900',
      };
    if (isTransport)
      return {
        bg: 'bg-white',
        border: 'border-transparent',
        text: 'text-slate-600',
        icon: 'text-slate-400',
        buttonBg: 'bg-slate-700',
        buttonColorHex: '#94a3b8',
        accent: 'bg-slate-100',
        note_bg: 'bg-slate-100',
        note_text: 'text-slate-700',
      };
    // Logistics 任務卡 玫瑰色
    if (isLogistics)
      return {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        text: 'text-rose-800',
        icon: 'text-rose-500',
        buttonBg: 'bg-rose-700',
        buttonColorHex: '#fda4af',
        accent: 'bg-rose-100',
        note_bg: 'bg-rose-100',
        note_text: 'text-rose-900',
      };
    if (isHub)
      return {
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
        text: 'text-indigo-800',
        icon: 'text-indigo-500',
        buttonBg: 'bg-indigo-700',
        buttonColorHex: '#a5b4fc',
        accent: 'bg-indigo-100',
        note_bg: 'bg-indigo-100',
        note_text: 'text-indigo-900',
      };
    if (aiData.theme === 'orange' || item.type === 'food')
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-slate-800',
        icon: 'text-orange-600',
        buttonBg: 'bg-orange-500',
        buttonColorHex: '#fdba74',
        accent: 'bg-orange-100',
        note_bg: 'bg-orange-100',
        note_text: 'text-orange-900',
      };
    return {
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      text: 'text-slate-800',
      icon: 'text-sky-600',
      buttonBg: 'bg-sky-700',
      buttonColorHex: '#7dd3fc',
      accent: 'bg-sky-100',
      note_bg: 'bg-sky-100',
      note_text: 'text-sky-900',
    };
  };

  const s = getStyle();

  // 修正 1: 記帳金額只基於實際儲存的項目計算，不涉及估算。
  const totalExpense =
    item.expenses?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

  // 插入在 Card 組件內部，return 之前
  // 🕒 自動計算時長函式
  const getDurationDisplay = () => {
    if (!item.timeStart || !item.timeEnd) return summary.stay_time || ''; // 如果沒有時間，才回退到 AI 資料

    try {
      const [startH, startM] = item.timeStart.split(':').map(Number);
      const [endH, endM] = item.timeEnd.split(':').map(Number);

      let diffMinutes = endH * 60 + endM - (startH * 60 + startM);

      // 處理跨日 (例如 23:00 到 01:00)
      if (diffMinutes < 0) diffMinutes += 24 * 60;

      const h = Math.floor(diffMinutes / 60);
      const m = diffMinutes % 60;

      if (h > 0 && m > 0) return `${h}hr ${m}m`;
      if (h > 0) return `${h}hr`;
      return `${m}m`;
    } catch (e) {
      return summary.stay_time || '';
    }
  };

  const displayDuration = getDurationDisplay();

  // 確保 mapQuery 使用 primary_info 或 location_keyword，並處理經緯度格式
  const mapQuery =
    isScouting &&
    summary.location_keyword &&
    /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(summary.location_keyword)
      ? summary.location_keyword
      : summary.primary_info || item.name;

  const renderActionBar = () => (
    <div className="flex items-center mt-3 pt-3 border-t border-black/5">
      <div className="flex gap-2 shrink-0">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            mapQuery
          )}`}
          target="_blank"
          rel="noreferrer"
          className="p-2 bg-white rounded-full shadow-sm text-blue-500 hover:bg-blue-50"
        >
          <MapPin size={16} />
        </a>
        <a
          href={`https://www.instagram.com/explore/tags/${encodeURIComponent(
            (item.jp_name || summary.primary_info || item.name).replace(
              /\s+/g,
              ''
            )
          )}/`}
          target="_blank"
          rel="noreferrer"
          className="p-2 bg-white rounded-full shadow-sm text-pink-500 hover:bg-pink-50"
        >
          <Instagram size={16} />
        </a>
      </div>
      {/* 修正: Logistics 任務卡按鈕顯示 '檢查清單' */}
      <button
        onClick={() => openAiModal(item)}
        className={`flex-1 mx-3 py-1.5 px-3 rounded-xl text-sm font-bold text-white shadow-sm
          hover:opacity-90 flex items-center justify-center gap-1`}
        // ✅ 新增 style 屬性，使用 S 物件中的顏色碼
        style={{ backgroundColor: s.buttonColorHex }}
      >
        {isSight ? (
          <>
            <Camera size={14} /> 導遊解說
          </>
        ) : isFood ? (
          <>
            <Utensils size={14} /> 美食筆記
          </>
        ) : isLogistics ? (
          <>
            <ListPlus size={14} /> 檢查清單
          </>
        ) : isScouting ? (
          <>
            <Target size={14} /> 場勘重點
          </>
        ) : (
          '詳細介紹'
        )}
      </button>
      {!isDeletedSection && (
        <div className="flex gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            className="p-2 text-slate-400 hover:text-blue-500 bg-white rounded-full shadow-sm"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-2 text-slate-400 hover:text-red-500 bg-white rounded-full shadow-sm"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );

  if (isTransport) {
    return (
      <div
        className={`relative flex gap-4 py-1 ${
          isDeletedSection ? 'opacity-50 grayscale' : ''
        }`}
      >
        {/* 時間軸線 */}
        <div className="flex flex-col items-center">
          <div className="w-0.5 h-full bg-slate-200 absolute top-0 left-5 -z-10"></div>
          <div className="w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-slate-400 shadow-sm z-10 my-auto">
            {summary.transport_mode === 'walk' ? (
              <Footprints size={16} />
            ) : summary.transport_mode === 'car' ? (
              <Car size={16} />
            ) : (
              <Train size={16} />
            )}
          </div>
        </div>
        {/* 交通卡內容 */}
        <div className="flex-1 bg-white rounded-xl border border-slate-100 p-2.5 shadow-sm relative group flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 rounded-full">
                {summary.header}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {item.timeStart} - {item.timeEnd}
              </span>
            </div>
            <h4 className="font-bold text-slate-700 text-sm mb-0.5">
              {item.name}
            </h4>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>{summary.primary_info}</span>
              {summary.secondary_info && (
                <span className="text-slate-400">
                  • {summary.secondary_info}
                </span>
              )}
            </div>
          </div>
          {/* 回收區按鈕 - 修正 2 */}
          {isDeletedSection ? (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => onRestore(item.id)}
                className="p-1.5 text-slate-400 hover:text-green-500"
              >
                <RefreshCcw size={14} />
              </button>
              <button
                onClick={() => onDelete(item.id)}
                className="p-1.5 text-slate-400 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(item);
                }}
                className="p-1.5 text-slate-300 hover:text-blue-500"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => onDelete(item.id)}
                className="p-1.5 text-slate-300 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // **重要修正: 移除原本獨立的 isScouting 區塊，改為直接使用下方的標準渲染區塊**
  // 這樣可以確保 Scouting 卡片能吃到所有標準功能 (備註、AI資料微調等)，同時透過 getStyle 保持其 Cyan 外觀。

  // 標準景點/美食/Logistics/Hub/Scouting 卡片
  return (
    <div
      className={`relative mb-4 rounded-2xl border ${
        isDeletedSection
          ? 'border-dashed border-gray-300 bg-gray-50 opacity-70 grayscale'
          : `${s.bg} ${s.border}`
      } p-4 shadow-sm transition-all`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          {/* Time Display */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold leading-none ${s.accent} ${s.icon}`}
          >
            <span>{item.timeStart}</span>
            <span className="opacity-50 text-[10px] scale-y-75">~</span>
            <span>{item.timeEnd}</span>
          </div>
          {/* Hub Header Display */}
          {isHub && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-0.5">
              {summary.header}
            </span>
          )}
          {summary.header && item.name.includes('方案') && (
            <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full font-bold flex items-center gap-1">
              <Split size={10} /> {summary.header}
            </span>
          )}
        </div>
        {/* Wallet/Expense Button */}
        {/* 修正 2: 記帳按鈕在回收區應該消失，這裡已經通過 !isDeletedSection 確保 */}
        {!isDeletedSection && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openExpenseModal(item);
            }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
              totalExpense > 0
                ? 'bg-yellow-100 border-yellow-300 text-yellow-700'
                : 'bg-white border-gray-200 text-gray-400'
            }`}
          >
            <Wallet size={12} />
            {totalExpense > 0 ? `¥${totalExpense.toLocaleString()}` : '記帳'}
          </button>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* Logistics 任務卡：主標題為地點，副標題為任務 */}
      {/* ---------------------------------------------------- */}

      {isLogistics ? (
        <div className="space-y-1">
          {/* 1. 主標題 (地點名稱) - Larger, Rose Color */}
          <h3 className={`text-xl font-black leading-tight ${s.text}`}>
            {summary.primary_info || item.name}
          </h3>

          {/* 2. 副標題 (任務名稱) - Smaller, Gray/Auxiliary Color */}
          <div className="flex items-center gap-2 text-slate-500 text-sm -mt-0.5">
            <ListPlus size={14} className="shrink-0 text-rose-400" />
            <span>{item.name}</span>
          </div>
          {/* 3. 💡 修正：補上電話號碼顯示 (Logistics 專用樣式) */}
          {summary.tel && (
            <div className="flex items-center gap-2 text-rose-700/80 text-xs font-mono mt-1 ml-0.5">
              <Phone size={12} className="shrink-0" />
              <span>{summary.tel}</span>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 主標題 (Location/Sight Name) - Large/Primary */}
          <h3 className={`text-lg font-bold leading-tight ${s.text} mb-1`}>
            {summary.primary_info || item.name}
          </h3>

          {/* 2. 💡 修正：簡短描述 (Subtitle) - 永遠顯示，不再被 AI 資料隱藏 */}
          {/* 把它當作副標題顯示，放在標題正下方 */}
          {item.desc && (
            <div className="text-sm text-slate-500 font-medium mb-2 line-clamp-2">
              {item.desc}
            </div>
          )}

          {/* 3. AI 資訊區塊 (電話/地點) - 保持原樣，但在描述下方 */}
          {(summary.tel || summary.location_keyword) && (
            <div className="flex items-start gap-2 text-slate-600 text-xs mt-1">
              {summary.tel ? (
                <Phone size={12} className="mt-0.5 shrink-0" />
              ) : (
                <MapPin size={12} className="mt-0.5 shrink-0" />
              )}
              <span className="font-mono opacity-80">
                {summary.tel || summary.location_keyword}
              </span>
            </div>
          )}
        </>
      )}

      {/* 備註顯示 - 修正: 修改背景色為毛玻璃效果 */}
      {item.notes && item.notes.length > 0 && (
        <div className={`mt-3 space-y-1 p-3 rounded-xl ${s.accent}`}>
          {item.notes.map((note, index) => (
            <div
              key={index}
              className={`flex items-start gap-2 ${s.note_text || 'text-slate-700'} text-xs`}
            >
              <Dot size={12} className="mt-0.5 shrink-0 text-slate-400" />
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs mt-3">
        {summary.stay_time && (
          <div className="flex items-center gap-1 text-slate-500 bg-white/60 px-2 py-1 rounded">
            <Clock size={10} /> <span>{displayDuration}</span>
          </div>
        )}
        {summary.one_line_tip && (
          <div className="flex items-center gap-1 text-orange-700 bg-orange-100/50 px-2 py-1 rounded font-medium">
            <Info size={10} /> {summary.one_line_tip}
          </div>
        )}
        {/* 增加場勘特有的 Photo Guide 顯示，讓它在標準卡片中也能出現 */}
        {summary.photo_guide && (
          <div className="flex items-center gap-1 text-cyan-700 bg-cyan-100/50 px-2 py-1 rounded font-medium">
            <Camera size={10} /> {summary.photo_guide}
          </div>
        )}
      </div>

      {/* 修正 2: 回收區卡片專屬的動作按鈕 */}
      {isDeletedSection ? (
        <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => onRestore(item.id)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors"
          >
            <RefreshCcw size={12} /> 恢復
          </button>
          <button
            onClick={() => onDelete(item.id)} // onDelete 在 App 組件中會執行永久刪除
            className="flex items-center gap-1 text-xs ml-2 px-3 py-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            <Trash2 size={12} /> 永久刪除
          </button>
        </div>
      ) : (
        renderActionBar()
      )}
    </div>
  );
};

// 🎯 AiContent 組件 (顯示預載好的 Details，若無則提示)
const AiContent = ({ item }) => {
  const hasDetails = item.aiData?.details?.content;

  if (!hasDetails) {
    return (
      <div className="p-8 text-center bg-red-50/50">
        <AlertCircle size={32} className="text-red-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-red-900 mb-2">長文內容缺失</h3>
        <p className="text-sm text-red-700">
          此項目深度解說尚未生成。請前往「旅人工具箱」執行 **「一鍵優化景點詳情
          (AI)」** 載入所有長文。
        </p>
      </div>
    );
  }

  const { details, theme } = item.aiData;
  const c =
    {
      blue: 'bg-sky-50 text-sky-800',
      orange: 'bg-orange-50 text-orange-800',
      gray: 'bg-slate-100 text-slate-800',
      dark: 'bg-slate-800 text-white',
      hub: 'bg-indigo-50 text-indigo-800',
      rose: 'bg-rose-50 text-rose-800', // Logistics 修正
    }[theme] || 'bg-slate-100 text-slate-800';

  const Section = ({ icon: Icon, title, content }) => {
    if (!content) return null;
    return (
      <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2 text-sm">
          <Icon size={16} /> {title}
        </h4>
        <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">
          {content}
        </p>
      </div>
    );
  };

  const ListSection = ({ icon: Icon, title, list }) => {
    if (!list || list.length === 0) return null;
    return (
      <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2 text-sm">
          <Icon size={16} /> {title}
        </h4>
        <ul className="space-y-1">
          {list?.map((t, i) => (
            <li key={i} className="text-sm text-slate-600 flex gap-2">
              <span className="text-slate-400">•</span> {t}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="p-0">
      <div
        className={`h-36 w-full ${c} flex items-center justify-center relative`}
      >
        <h2 className="text-2xl font-bold relative z-10 px-6 text-center leading-relaxed">
          {details?.title || item.name}
        </h2>
      </div>
      <div className="p-6 bg-white rounded-t-3xl -mt-6 relative">
        <p className="prose prose-sm text-slate-600 mb-6 whitespace-pre-line leading-7 text-justify">
          {details?.content}
        </p>

        {details?.history && (
          <Section
            icon={History}
            title="歷史與故事"
            content={details.history}
          />
        )}
        {details?.photo_advice && (
          <Section
            icon={Eye}
            title="攝影師之眼"
            content={details.photo_advice}
          />
        )}
        {details?.experience_tip && (
          <Section
            icon={Footprints}
            title="體驗建議"
            content={details.experience_tip}
          />
        )}

        <ListSection
          icon={ShoppingBag}
          title="必買清單"
          list={details.must_buy}
        />
        <ListSection icon={Utensils} title="必吃清單" list={details.must_eat} />
        <ListSection
          icon={CheckCircle2}
          title="重點清單"
          list={details.must_list}
        />

        {details?.recommendation && (
          <div className="mt-4 p-4 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 bg-gray-50">
            <span className="font-bold">💡 額外推薦：</span>{' '}
            {details.recommendation}
          </div>
        )}
      </div>
    </div>
  );
};

// --- App 主組件邏輯 ---

// Helper function to calculate time difference in minutes
const timeToMinutes = (time) => {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

// Helper function to convert minutes back to "HH:MM" format
const minutesToTime = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0'
  )}`;
};

// 🕒 時間權重計算器：解決跨日排序問題 (00:00-04:59 視為隔天，加 24 小時)
const getTimeWeight = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  // 如果是凌晨 < 5點，加 24 小時權重，讓它排在深夜
  if (h < 2.5) return (h + 24) * 60 + m;
  return h * 60 + m;
};

export default function App() {
  // 從 localStorage 載入數據，如果沒有則使用 INITIAL_SCHEDULE
  const loadInitialSchedule = () => {
    try {
      const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedData) {
        // 注意：JSON.parse 可能失敗，需要try-catch
        const parsedData = JSON.parse(savedData);
        // 檢查數據是否為有效陣列
        if (Array.isArray(parsedData) && parsedData.length > 0) {
          return parsedData;
        }
      }
    } catch (error) {
      console.error(
        'Failed to load schedule from localStorage, using default.',
        error
      );
    }
    return INITIAL_SCHEDULE;
  };

  const [activeTab, setActiveTab] = useState('08/05');
  const [activePlan, setActivePlan] = useState('A');
  const [view, setView] = useState('itinerary');
  // 使用 loadInitialSchedule 載入持久化數據
  const [schedule, setSchedule] = useState(loadInitialSchedule);
  const [isSortMode, setIsSortMode] = useState(false);
  const [modalState, setModalState] = useState({ type: null, data: null });
  const [isFilling, setIsFilling] = useState(false);

  // --- 🆕 修正代碼開始：全域捲動記憶與還原 ---
  
  // 1. 使用 useRef 建立一個不會觸發畫面重繪的記憶庫
  const scrollPositions = useRef({});

  useEffect(() => {
    // 步驟 A：切換日期後，立刻「瞬間移動」到該日期上次的紀錄點
    // 如果該日期沒紀錄過 (undefined)，就回到最頂端 (0)
    const savedPosition = scrollPositions.current[activeTab] || 0;
    window.scrollTo(0, savedPosition);

    // 步驟 B：定義一個監聽函式，隨時把現在滑到的高度存起來
    const handleScroll = () => {
      scrollPositions.current[activeTab] = window.scrollY;
    };

    // 步驟 C：告訴瀏覽器開始監聽捲動
    window.addEventListener('scroll', handleScroll);

    // 步驟 D：當使用者切換到別的日期時，先移除這個監聽器 (Cleanup)
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [activeTab]); // 只要 activeTab 一變，這段邏輯就會重新執行

  // --- 修正代碼結束 ---
  
  // ---------------------------------





  // useEffect 儲存數據到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(schedule));
    } catch (error) {
      console.error('Failed to save schedule to localStorage:', error);
    }
  }, [schedule]);

  const days = [
    { date: '08/05', day: '水' },
    { date: '08/06', day: '木' },
    { date: '08/07', day: '金' },
    { date: '08/08', day: '土' },
    { date: '08/09', day: '日' },
    { date: '08/10', day: '月' },
    { date: '08/11', day: '火' },
    { date: '08/12', day: '水' },
    { date: '08/13', day: '木' },
    { date: '08/14', day: '金' },
    { date: '08/15', day: '土' },
    { date: '08/16', day: '日' },
    { date: '08/17', day: '月' },
  ];
// 範例概念：定義每一天 Plan A 和 Plan B 的標題
  const PLAN_CONFIG = {
  '08/08': { A: '西岸:西教寺', B: '東岸:志那-1' },
  '08/13': { A: '藏王絕景', B: '山寺古剎' },
  '08/14': { A: '慈恩寺：補眠與古剎', B: '山寺：晨間攻頂' }, // 假設 8/14 是花火攝點 A/B
  '08/16': { A: '補考：藏王御釜', B: '療癒：秋保絕景' }  // 假設 8/15 的內容
};
  // 計算篩選後的行程和總開銷
  const activeItems = schedule
    .filter((item) => {
      if (item.date !== activeTab || item.status !== 'active') return false;
      // 檢查這一天是否在設定檔中 (代表這一天有分 A/B)
      const hasPlan = PLAN_CONFIG[activeTab];
      if (hasPlan && item.plan) {
        return item.plan === activePlan;
      }
      return true;
    })
    .sort((a, b) => {
      // 先按時間排序
      const timeA = a.timeStart.replace(':', '');
      const timeB = b.timeStart.replace(':', '');
      if (timeA !== timeB) return timeA - timeB;
      // 如果時間相同，使用 order 欄位（若存在）進行穩定排序
      return (a.order || 0) - (b.order || 0);
    });

  const deletedItems = schedule.filter((i) => i.status === 'deleted');
  // 修正 1: 計算總開銷邏輯不變，它只計算實際輸入的 expenses。
  const dailyTotal = activeItems.reduce(
    (sum, item) =>
      sum +
      (item.expenses?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0),
    0
  );
  const globalTotal = schedule.reduce(
    (sum, item) =>
      item.status === 'deleted'
        ? sum
        : sum +
          (item.expenses?.reduce((acc, curr) => acc + Number(curr.amount), 0) ||
            0),
    0
  );

  // CRUD 操作
  const handleMove = (id, direction) => {
    const index = activeItems.findIndex((i) => i.id === id);
    if (index === -1) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= activeItems.length) return;

    const itemToMove = activeItems[index];
    const itemToSwap = activeItems[newIndex];

    const updatedSchedule = schedule.map((item) => {
      if (item.id === itemToMove.id)
        return { ...item, order: itemToSwap.order };
      if (item.id === itemToSwap.id)
        return { ...item, order: itemToMove.order };
      return item;
    });
    setSchedule(updatedSchedule);
  };

  const handleAdd = (newItem) => {
    // 尋找當天最後一個項目的 order，並加一作為新的 order
    const maxOrder = Math.max(
      ...schedule
        .filter((i) => i.date === newItem.date)
        .map((i) => i.order || 0),
      0
    );
    setSchedule([
      ...schedule,
      {
        ...newItem,
        id: Date.now(),
        status: 'active',
        expenses: newItem.expenses || [],
        order: maxOrder + 1,
      },
    ]);
    closeModal();
  };

  // 修正 2: 更新行程時自動推移後續行程的時間
  const handleUpdate = (updatedItem) => {
    const originalItem = schedule.find((i) => i.id === updatedItem.id);

    if (originalItem && originalItem.date === updatedItem.date) {
      // 計算時間差 (以分鐘為單位)
      const oldStartMinutes = timeToMinutes(originalItem.timeStart);
      const newStartMinutes = timeToMinutes(updatedItem.timeStart);

      const oldEndMinutes = timeToMinutes(originalItem.timeEnd);
      const newEndMinutes = timeToMinutes(updatedItem.timeEnd);

      // 計算結束時間的偏移量 (重點)
      const endTimeDifference = newEndMinutes - oldEndMinutes;

      // 計算開始時間的偏移量 (用於調整當前項目 timeStart -> timeEnd)
      const startTimeDifference = newStartMinutes - oldStartMinutes;

      // 判斷是否需要推移後續項目：只要時間長度變了(endTimeDifference != startTimeDifference)或開始時間變了，都應該處理
      // 我們主要關心的是整個活動**長度的變化**以及**結束時間的偏移**

      let timeDifferenceToShift = 0;

      // 如果只有時長改變，我們應考慮 timeEnd 的變化
      if (endTimeDifference !== 0) {
        timeDifferenceToShift = endTimeDifference;
      }

      // 如果活動時間被移動了（例如 10:00 -> 12:00，但持續時間不變），後續項目也需移動
      const offsetChange = newStartMinutes - oldStartMinutes;
      if (offsetChange !== 0 && timeDifferenceToShift === 0) {
        timeDifferenceToShift = offsetChange;
      }

      if (timeDifferenceToShift !== 0) {
        let foundCurrentItem = false;

        const updatedSchedule = schedule.map((item) => {
          // 找到被更新的項目
          if (item.id === updatedItem.id) {
            foundCurrentItem = true;
            return updatedItem; // 這裡返回已更新的項目
          }

          // 確保只更新同一天的後續項目
          if (item.date === updatedItem.date && foundCurrentItem) {
            // 偏移後續項目的開始時間
            const itemStartMinutes =
              timeToMinutes(item.timeStart) + timeDifferenceToShift;
            const itemEndMinutes =
              timeToMinutes(item.timeEnd) + timeDifferenceToShift;

            // 確保時間不會超過 23:59 (跨日移動邏輯複雜，這裡暫不處理，只保持在當日)
            if (itemStartMinutes >= 24 * 60) {
              // 這裡可以選擇將項目標記為跨日或刪除，為簡潔，保持時間不變但發出警告
              console.warn(
                `Item ${item.name} moved past midnight and was not shifted.`
              );
              return item;
            }

            return {
              ...item,
              timeStart: minutesToTime(itemStartMinutes),
              timeEnd: minutesToTime(itemEndMinutes),
            };
          }

          return item;
        });

        setSchedule(updatedSchedule);
      } else {
        // 如果沒有時間偏移，只更新當前項目
        setSchedule(
          schedule.map((i) => (i.id === updatedItem.id ? updatedItem : i))
        );
      }
    } else {
      // 如果日期不同，則只執行標準更新
      setSchedule(
        schedule.map((i) => (i.id === updatedItem.id ? updatedItem : i))
      );
    }

    closeModal();
  };

  const handleDelete = (id) => {
    const item = schedule.find((i) => i.id === id);
    if (item.status === 'deleted') {
      // 從清單中永久刪除 (當卡片已在回收區時觸發)
      setSchedule(schedule.filter((i) => i.id !== id));
    } else {
      // 標記為刪除 (移至回收區)
      setSchedule(
        schedule.map((i) => (i.id === id ? { ...i, status: 'deleted' } : i))
      );
    }
  };
  const handleRestore = (id) => {
    setSchedule(
      schedule.map((i) => (i.id === id ? { ...i, status: 'active' } : i))
    );
  };
  const openModal = (type, data = null) => setModalState({ type, data });
  const closeModal = () => setModalState({ type: null, data: null });

  // 🎯 批次填充邏輯
  const handleBatchFill = async () => {
    if (isFilling) return;
    setIsFilling(true);
    await autoFillAllDetails(schedule, setSchedule);
    setIsFilling(false);
  };

  // Sub-components
  // ... AiContent (已在上方定義)

  const ExpenseEditor = ({ item }) => {
    const [expenses, setExpenses] = useState(item.expenses || []);
    const [newItem, setNewItem] = useState(item.name);
    const [newAmount, setNewAmount] = useState('');

    // 檢查新的 item/amount 是否有效
    const canAdd =
      newItem.trim() !== '' &&
      newAmount.trim() !== '' &&
      !isNaN(Number(newAmount)) &&
      Number(newAmount) > 0;

    const add = () => {
      if (canAdd) {
        setExpenses([
          ...expenses,
          { item: newItem.trim(), amount: Number(newAmount) },
        ]);
        setNewItem(item.name); // 重設為行程名稱，方便快速記帳
        setNewAmount('');
      }
    };

    const remove = (idx) => setExpenses(expenses.filter((_, i) => i !== idx));
    const total = expenses.reduce((acc, curr) => acc + curr.amount, 0);

    return (
      <div className="p-6 bg-yellow-50 min-h-[50vh] flex flex-col">
        <h3 className="text-xl font-bold text-yellow-900 mb-4 flex items-center gap-2">
          <Wallet /> 記帳本：{item.name}
        </h3>
        <div className="bg-white p-4 rounded-xl shadow-sm mb-4 space-y-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            className="w-full p-2 border rounded-xl"
            placeholder="項目名稱 (例如：沾麵、租車費)"
            type="text"
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="flex-1 p-2 border rounded-xl"
              placeholder="金額 (日圓 ¥)"
              min="0"
            />
            <button
              onClick={add}
              disabled={!canAdd}
              className={`px-4 rounded-xl transition-colors ${
                canAdd
                  ? 'bg-yellow-400 text-white hover:bg-yellow-500'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto">
          {expenses.map((ex, i) => (
            <div
              key={i}
              className="flex justify-between bg-white p-3 rounded-xl border border-yellow-100 items-center"
            >
              <span>{ex.item}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-lg text-yellow-700">
                  ¥{ex.amount.toLocaleString()}
                </span>
                <button
                  onClick={() => remove(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-4 border-t border-yellow-200 mt-auto">
          <div className="flex justify-between font-bold text-2xl mb-4 text-yellow-900">
            <span>總計</span>
            <span>¥{total.toLocaleString()}</span>
          </div>
          <button
            onClick={() => {
              handleUpdate({ ...item, expenses });
            }}
            className="w-full py-3 bg-yellow-500 text-white rounded-xl font-bold shadow-lg hover:bg-yellow-600 transition-colors"
          >
            儲存並關閉
          </button>
        </div>
      </div>
    );
  };

  // 🎯 AddEditForm 組件 (用於新增/編輯卡片，包含備註的更新邏輯)
  const AddEditForm = ({ item, isEdit = false }) => {
    const baseItem = item || {
      date: activeTab,
      type: 'sight',
      name: '',
      timeStart: '10:00',
      timeEnd: '12:00',
      desc: '',
      notes: [],
      aiData: { category: 'activity', theme: 'blue', summary: {}, details: {} },
    };

    const initialFormData = {
      ...baseItem,
      aiData: {
        ...baseItem.aiData,
        summary: baseItem.aiData?.summary || {}, // 確保 summary 是物件
        details: baseItem.aiData?.details || {}, // 確保 details 是物件
      },
    };

    const [formData, setFormData] = useState(initialFormData);
    const [loading, setLoading] = useState(false);
    const [newNote, setNewNote] = useState('');
    // 💡 備註歷史記錄，用於 undo
    const [history, setHistory] = useState([item?.notes || []]);

    // 💡 新增安全的狀態更新 Helper Functions
    const handleChange = (field, value) =>
      setFormData((prev) => ({ ...prev, [field]: value }));
    const handleSummaryChange = (field, value) => {
      // 使用功能性更新和可選鏈 (Optional Chaining) 與後備物件 (Fallback Object) 來確保巢狀物件存在
      setFormData((prev) => ({
        ...prev,
        aiData: {
          ...(prev.aiData || {
            category: 'activity',
            theme: 'blue',
            summary: {},
            details: {},
          }),
          summary: {
            ...(prev.aiData?.summary || {}),
            [field]: value,
          },
        },
      }));
    };

    // 替換 AddEditForm 內部的 autoFill 函式
    const autoFill = async () => {
      if (!formData.name) return;
      setLoading(true);

      // 呼叫 fetchSummary
      const res = await fetchSummary(formData.name, formData.type);

      setLoading(false);
      if (res) {
        // 💡 統一使用 prev 進行安全、深層次的數據合併
        setFormData((prev) => {
          const newAiData = res.aiData || {};
          const newSummary = newAiData.summary || {};
          const prevAiData = prev.aiData || {};
          const prevSummary = prevAiData.summary || {};

          return {
            ...prev,
            desc: res.desc || prev.desc,
            jp_name: res.jp_name || prev.jp_name,
            aiData: {
              ...prevAiData,
              ...newAiData,
              summary: {
                ...prevSummary,
                ...newSummary,
              },
            },
          };
        });
      }
    };

    // 備註操作
    const addNote = () => {
      if (!newNote.trim()) return;
      const updated = [...(formData.notes || []), newNote.trim()];
      setFormData({ ...formData, notes: updated });
      setHistory([...history, updated]);
      setNewNote('');
    };

    const deleteNote = (idx) => {
      const updated = formData.notes.filter((_, i) => i !== idx);
      setFormData({ ...formData, notes: updated });
      setHistory([...history, updated]);
    };

    const undo = () => {
      if (history.length <= 1) return;
      const prev = history[history.length - 2];
      setFormData({ ...formData, notes: prev });
      setHistory(history.slice(0, -1));
    };

    return (
      <div className="p-6 bg-slate-50 min-h-[60vh] space-y-4">
        <h3 className="font-bold text-2xl mb-4">
          {isEdit ? '編輯' : '新增'}行程卡片
        </h3>

        {/* 行程分類 */}
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
          {['sight', 'food', 'transport'].map((t) => (
            <button
              key={t}
              onClick={() => handleChange('type', t)}
              className={`flex-1 py-2 rounded-lg capitalize font-bold transition-colors ${
                formData.type === t
                  ? 'bg-sky-500 text-white shadow-md'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {t === 'sight' ? '景點/活動' : t === 'food' ? '美食' : '交通'}
            </button>
          ))}
        </div>

        {/* 名稱與 AI 自動填充 */}
        <div className="flex gap-2">
          <input
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="flex-1 p-3 rounded-xl border shadow-sm focus:ring-sky-500 focus:border-sky-500 text-slate-900"
            placeholder="地點/活動名稱"
            type="text"
          />
          <button
            onClick={autoFill}
            disabled={loading || !formData.name}
            className={`px-4 rounded-xl font-bold text-white shadow-md transition-colors ${
              loading ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Sparkles size={20} />
            )}
          </button>
        </div>

        {/* 時間設定 */}
        <div className="flex gap-2 bg-white p-3 rounded-xl border shadow-sm">
          <input
            type="time"
            value={formData.timeStart}
            onChange={(e) => handleChange('timeStart', e.target.value)}
            className="flex-1 p-1 border-b text-slate-900"
          />
          <span className="self-center text-slate-400">至</span>
          <input
            type="time"
            value={formData.timeEnd}
            onChange={(e) => handleChange('timeEnd', e.target.value)}
            className="flex-1 p-1 border-b text-slate-900"
          />
        </div>

        {/* 簡短描述 */}
        <textarea
          className="w-full p-3 rounded-xl border shadow-sm text-slate-900"
          rows={3}
          value={formData.desc}
          onChange={(e) => handleChange('desc', e.target.value)}
          placeholder="簡短描述 (例如：武田信玄創建 / 極濃沾麵)..."
        />

        {/* AI 資料微調區塊 */}
        {formData.aiData.summary && (
          <div className="space-y-2 p-3 bg-blue-50 rounded-xl border border-blue-100">
            <div className="text-xs font-bold text-blue-500 flex items-center gap-1">
              <RefreshCcw size={12} /> AI 資料微調 (影響卡片顯示)
            </div>

            {/* primary_info (地點/主要資訊) */}
            <input
              className="w-full p-2 text-sm border rounded-lg shadow-sm text-slate-900"
              value={formData.aiData.summary.primary_info || ''}
              onChange={(e) =>
                handleSummaryChange('primary_info', e.target.value)
              }
              placeholder="地點名稱/主要資訊 (Primary Info)"
              type="text"
            />

            {/* tel */}
            <input
              className="w-full p-2 text-sm border rounded-lg shadow-sm text-slate-900"
              value={formData.aiData.summary.tel || ''}
              onChange={(e) => handleSummaryChange('tel', e.target.value)}
              placeholder="電話號碼 (Tel)"
              type="tel"
            />

            {/* location_keyword */}
            <input
              className="w-full p-2 text-sm border rounded-lg shadow-sm text-slate-900"
              value={formData.aiData.summary.location_keyword || ''}
              onChange={(e) =>
                handleSummaryChange('location_keyword', e.target.value)
              }
              placeholder="導航關鍵字 (Location Keyword)"
              type="text"
            />

            {/* one_line_tip */}
            <input
              className="w-full p-2 text-sm border rounded-lg shadow-sm text-slate-900"
              value={formData.aiData.summary.one_line_tip || ''}
              onChange={(e) =>
                handleSummaryChange('one_line_tip', e.target.value)
              }
              placeholder="一句話攻略 (One Line Tip)"
              type="text"
            />
          </div>
        )}

        {/* 備註清單編輯 */}
        <div className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-sm text-slate-900">備註清單</h4>
            {history.length > 1 && (
              <button
                onClick={undo}
                className="text-xs flex items-center gap-1 text-slate-500 hover:text-blue-500"
              >
                <Undo2 size={12} /> 復原 ({history.length - 1})
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="flex-1 p-2 border rounded-lg text-sm text-slate-900"
              placeholder="新增備註..."
              type="text"
            />
            <button
              onClick={addNote}
              className="bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-700 transition-colors "
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="space-y-1">
            {(formData.notes || []).map((n, i) => (
              <div
                key={i}
                className="flex justify-between items-center p-2 bg-slate-50 rounded-lg text-sm group border border-slate-100 text-slate-900"
              >
                <span>{n}</span>
                <button
                  onClick={() => deleteNote(i)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            isEdit ? handleUpdate(formData) : handleAdd(formData);
          }}
          className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-xl hover:bg-slate-800 transition-colors"
        >
          {isEdit ? '儲存變更' : '新增行程'}
        </button>
      </div>
    );
  };

  const PhraseModal = ({ phrase }) => (
    <div className="p-8 text-center bg-indigo-50/50">
      <div className="inline-block p-4 bg-white rounded-full shadow-lg mb-4">
        <Languages size={32} className="text-indigo-500" />
      </div>
      <h3 className="text-gray-400 font-bold mb-4">{phrase.label}</h3>
      <div className="text-3xl font-black text-slate-800 mb-4 leading-normal">
        {phrase.jp}
      </div>
      <div className="text-xl text-indigo-500 font-mono font-bold bg-indigo-100 inline-block px-3 py-1 rounded-lg">
        {phrase.romaji}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-28 max-w-md mx-auto relative shadow-2xl selection:bg-blue-100">
      {view === 'itinerary' && (
        <>
          {/* 1. Header Image + Title (Scrolling part) */}
          <div className="h-44 w-full relative group bg-white shadow-sm">
            <img
              src={BG_IMAGES[activeTab] || BG_IMAGES['08/06']}
              alt={`Day ${activeTab}`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-5">
              <div>
                <span className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-white font-bold border border-white/30">
                  2026 花火大縱走
                </span>
                <h1 className="text-white text-3xl font-bold">
                  {activeTab} 
                </h1>
              </div>
            </div>
          </div>

          {/* 2. Date Tabs (Sticky part, FIXED: top-0 相對於主滾動條) */}
          <div className="flex overflow-x-auto bg-white border-b no-scrollbar py-3 px-2 gap-2 sticky top-0 z-40 shadow-md">
            {days.map((d) => (
              <button
                key={d.date}
                onClick={() => {
                  setActiveTab(d.date);
                  setActivePlan('A');
                }}
                className={`flex flex-col items-center justify-center min-w-[50px] py-1 px-2 rounded-xl transition-all border
                                                ${
                                                  activeTab === d.date
                                                    ? 'bg-slate-900 text-white border-slate-900 shadow-lg transform scale-105'
                                                    : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50'
                                                }`}
              >
                <span className="text-[10px] font-bold opacity-80">
                  {d.day}
                </span>
                <span className="text-xs font-black">
                  {d.date.split('/')[1]}日
                </span>
              </button>
            ))}
          </div>
          {/* 行程卡片列表 */}
          <div className="p-4 space-y-1 relative min-h-[500px]">
            {/* 時間軸線 */}
            <div className="absolute left-[34px] top-4 bottom-4 w-0.5 bg-slate-200 -z-0"></div>

            {/* Plan Switcher for 08/08 */}
            {PLAN_CONFIG[activeTab] && (
              // Plan Switcher 需要緊跟在 Date Tabs 下方，top 設為 Date Tabs 的估計高度 (約 56px)
              <div className="flex bg-white p-1 rounded-xl border border-slate-200 mb-4 shadow-md sticky top-[56px] z-20 mx-2">
                <button
                  onClick={() => setActivePlan('A')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    activePlan === 'A'
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Plan A{' '}
                  <span className="text-xs opacity-80 font-normal">
                   {PLAN_CONFIG[activeTab].A}
                    </span>
                </button>
                <button
                  onClick={() => setActivePlan('B')}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    activePlan === 'B'
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Plan B{' '}
                  <span className="text-xs opacity-80 font-normal">
                  {PLAN_CONFIG[activeTab].B}
                    </span>
                </button>
              </div>
            )}

            {/* Cards List */}
            {activeItems
              // 🟢 插入這段：依照 getTimeWeight 計算出的權重來排序
              .sort((a, b) => {
                const wA = getTimeWeight(a.timeStart);
                const wB = getTimeWeight(b.timeStart);
                return wA - wB;
              })
              // 🔵 原本的 map 接在後面，負責把排好序的卡片畫出來
              .map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  isSortMode={isSortMode}
                  onDelete={handleDelete}
                  onEdit={(data) => openModal('edit', data)}
                  openAiModal={(item) => openModal('ai', item)}
                  openExpenseModal={(item) => openModal('expense', item)}
                  onRestore={handleRestore}
                />
              ))}

            {activeItems.length > 0 && (
              <div className="mt-8 bg-white p-4 rounded-xl border shadow-lg flex justify-between z-10 relative">
                <span className="font-bold text-slate-600">本日總計</span>
                <span className="font-mono font-bold text-2xl text-yellow-700">
                  ¥{dailyTotal.toLocaleString()}
                </span>
              </div>
            )}

            {/* 回收區 */}
            {deletedItems.length > 0 && (
              <div className="mt-8 border-t-2 border-dashed pt-4 opacity-60">
                <h3 className="text-xs font-bold text-slate-400 mb-2 text-center">
                  回收區 ({deletedItems.length} 項)
                </h3>
                {deletedItems.map((item) => (
                  <Card
                    key={item.id}
                    item={item}
                    isDeletedSection={true}
                    onDelete={(id) => handleDelete(id)}
                    onRestore={handleRestore} // 修正 2: 傳遞 restore 函式給卡片
                    // 刪除項目不需要打開 AI 或編輯 Modal
                    openAiModal={() => {}}
                    openExpenseModal={() => {}}
                    onEdit={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {/* 🎯 工具箱視圖 (請貼在 itinerary 視圖判斷式的下方) */}
      {view === 'toolbox' && (
        <div className="p-6 pt-12 min-h-screen bg-slate-50">
          <h2 className="text-3xl font-bold mb-6">旅人工具箱</h2>

          {/* 🎯 批次填充按鈕 */}
          <button
            onClick={handleBatchFill}
            disabled={isFilling}
            className={`w-full py-4 px-4 rounded-2xl font-black text-lg text-white shadow-xl mb-8 flex items-center justify-center gap-3 transition-colors ${
              isFilling
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isFilling ? (
              <>
                <Loader2 className="animate-spin" size={24} />{' '}
                正在批次生成長文...
              </>
            ) : (
              <>
                <Sparkles size={24} /> 一鍵優化景點詳情 (AI)
              </>
            )}
          </button>

          {/* 總支出卡片 */}
          <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-3xl p-6 text-white shadow-xl mb-8">
            <div className="opacity-80 text-sm mb-1 font-semibold flex items-center gap-1">
              <Wallet size={16} /> 旅費總支出 (Active)
            </div>
            <div className="text-5xl font-mono font-black">
              ¥{(globalTotal || 0).toLocaleString()}
            </div>
          </div>

          <div className="space-y-4">
            {/* 航班資訊 */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold mb-3 text-lg flex gap-2 text-slate-700">
                <Plane /> 航班資訊
              </h3>
              <div className="text-sm text-slate-600">
                <div className="flex justify-between py-1">
                  <span>去程：{FLIGHT_INFO?.outbound?.flight}</span>
                  <span className="font-mono">
                    {FLIGHT_INFO?.outbound?.time}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span>回程：{FLIGHT_INFO?.inbound?.flight}</span>
                  <span className="font-mono">
                    {FLIGHT_INFO?.inbound?.time}
                  </span>
                </div>
              </div>
            </div>

            {/* 住宿列表 */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold mb-3 text-lg flex gap-2 text-slate-700">
                <Home /> 住宿列表
              </h3>
              <div className="text-sm text-slate-600 space-y-2">
                {ACCOMMODATION_LIST?.map((a, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-start border-b border-dashed pb-1"
                  >
                    <div>
                      <span className="font-bold mr-1">
                        {a.date.split('/')[1]}日:
                      </span>{' '}
                      {a.name}
                    </div>
                    <div className="text-right ml-2">
                      <span className="font-mono text-sm text-yellow-600 font-bold">
                        {a.price}
                      </span>
                      <div className="text-[10px] text-gray-400">{a.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 旅遊日文 */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold mb-3 text-lg flex gap-2 text-slate-700">
                <Languages /> 旅遊日文
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {JAPANESE_PHRASES?.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => openModal('phrase', p)}
                    className="p-3 bg-indigo-50 rounded-xl text-left text-xs border border-indigo-100 shadow-sm hover:bg-indigo-100 transition-colors"
                  >
                    <div className="font-bold text-indigo-800">{p.label}</div>
                    <div className="text-slate-500 font-mono text-sm">
                      {p.jp}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 底部導航欄 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t flex justify-between items-end px-10 pb-6 pt-2 z-50 max-w-md mx-auto shadow-inner">
        <button
          onClick={() => setView('itinerary')}
          className={`flex flex-col items-center transition-colors ${
            view === 'itinerary' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          <Calendar size={24} />
          <span className="text-[10px] font-bold">行程</span>
        </button>
        <div className="relative -top-6">
          <button
            onClick={() => openModal('add')}
            className="w-16 h-16 bg-sky-500 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform ring-4 ring-sky-200/50"
          >
            <Plus size={32} />
          </button>
        </div>
        <button
          onClick={() => setView('toolbox')}
          className={`flex flex-col items-center transition-colors ${
            view === 'toolbox' ? 'text-blue-600' : 'text-slate-400'
          }`}
        >
          <Globe size={24} />
          <span className="text-[10px] font-bold">工具箱</span>
        </button>
      </div>

      {/* Modal 區塊 */}
      <Modal
        isOpen={!!modalState.type}
        onClose={closeModal}
        bgColor={modalState.type === 'expense' ? 'bg-yellow-50' : 'bg-white'}
      >
        {modalState.type === 'ai' && <AiContent item={modalState.data} />}
        {modalState.type === 'expense' && (
          <ExpenseEditor item={modalState.data} />
        )}
        {modalState.type === 'edit' && (
          <AddEditForm item={modalState.data} isEdit={true} />
        )}
        {modalState.type === 'add' && <AddEditForm />}
        {modalState.type === 'phrase' && (
          <PhraseModal phrase={modalState.data} />
        )}
      </Modal>
    </div>
  );
}