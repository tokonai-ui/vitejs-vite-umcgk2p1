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
  '08/05': 'https://duk.tw/lDK2Dq.jpg?q=150&w=2070', // Airport
  '08/06': 'https://duk.tw/iB1NMl.jpg?q=80&w=2070', // Kofu
  '08/07': 'https://duk.tw/4zEjCh.jpg?q=80&w=2070', // Fireworks
  '08/08': 'https://duk.tw/cZpqnt.jpg?q=80&w=2070', // Biwako
  '08/09': 'https://duk.tw/yAkVSE.jpg?q=80&w=2070', //
  '08/10': 'https://duk.tw/h0bkQj.jpg?q=80&w=2070', //
  '08/11': 'https://duk.tw/3VofCP.jpg?q=80&w=2070', //
  '08/12': 'https://duk.tw/OU7Fqw.jpg?q=80&w=2070', //
  '08/13': 'https://duk.tw/OU7Fqw.jpg?q=80&w=2070', //
  '08/14': 'https://duk.tw/OU7Fqw.jpg?q=80&w=2070', //
  '08/15': 'https://duk.tw/OU7Fqw.jpg?q=80&w=2070', //
  '08/16': 'https://duk.tw/OU7Fqw.jpg?q=80&w=2070',
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
  {
    id: 100,
    date: '08/05',
    type: 'hub',
    name: '起點：桃園機場 T1',
    timeStart: '17:25',
    timeEnd: '17:55',
    desc: '集合與航廈確認',
    status: 'active',
    expenses: [],
    jp_name: '桃園空港 第1ターミナル',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '旅程序章',
        primary_info: '桃園國際機場 第一航廈',
        location_keyword: 'TPE Terminal 1',
        stay_time: '30m',
        one_line_tip: '樂桃航空位於第一航廈',
        tel: '+886-3-398-3728',
      },
      details: {
        title: '前往夏日的日本',
        content:
          '黃昏時分，桃園機場第一航廈熙來攘往。這裡是我們這趟「山梨花火與東北祭典」壯遊的起點。樂桃航空 (Peach Aviation) 的櫃台位於第一航廈，請務必再三確認電子機票上的資訊。雖然心情是雀躍的，但此刻最重要的是冷靜的檢查：護照有效期？日文駕照譯本帶了嗎？這半小時是用來將心態從「工作模式」切換為「冒險模式」的儀式。',
        tour_guide_advice:
          '廉價航空對於行李重量非常計較（手提 7kg）。建議在掛行李前，先在旁邊的磅秤確認重量，以免在櫃檯前手忙腳亂重整行李。',
        must_list: ['重點：確認T1航廈', '必備：護照', '必備：駕照譯本'],
      },
    },
  },
  {
    id: 101,
    date: '08/05',
    type: 'sight',
    name: '後勤：報到與安檢',
    timeStart: '17:55',
    timeEnd: '20:25',
    desc: 'LCC 關櫃嚴格',
    status: 'active',
    expenses: [],
    jp_name: 'チェックイン',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: '樂桃航空 報到櫃台',
        location_keyword: 'Peach Check-in Counter',
        stay_time: '2.5hr',
        one_line_tip: '起飛前50分鐘嚴格關櫃',
        tel: '+886-2-2656-3202',
      },
      details: {
        title: '與時間賽跑的通關',
        content:
          '廉價航空 (LCC) 的規則是鐵律，通常在起飛前 50 分鐘會準時關櫃，一分鐘都不會通融。因此，我們預留了充裕的時間。完成報到與安檢後，進入管制區。這是你在踏上日本國土前，最後一次品嚐台灣味或補給水的機會。利用這段時間去裝滿你的水壺，並確認隨身包包裡有原子筆（填寫表格備用，雖然現在都用 VJW）。',
        tour_guide_advice:
          '樂桃的登機門有時會安排在比較遠的位置，甚至需要搭乘接駁車。請務必在登機時間前 30 分鐘抵達登機門，不要在免稅店流連忘返。',
        must_list: ['注意：關櫃時間', '準備：空水壺裝水', '心態：從容不迫'],
      },
    },
  },
  {
    id: 102,
    date: '08/05',
    type: 'transport',
    name: '移動：桃園 ➡ 羽田',
    timeStart: '20:25',
    timeEnd: '00:45',
    desc: 'MM860 紅眼航班',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '夜間飛行',
        primary_info: '樂桃 MM860',
        secondary_info: '預計 00:45 抵達羽田',
        tel: 'N/A',
      },
      details: {
        title: '三小時的空中休息',
        content:
          '飛機衝入夜空，這是一班典型的「紅眼航班」。機上沒有免費餐飲，狹窄的座位是為了節省旅費的代價。建議在登機前先吃飽，或者帶一些簡單的麵包（注意液體限制）。這三個多小時的航程，請戴上降噪耳機與眼罩，強迫自己休息。因為落地後，我們將面臨深夜抵達的體力挑戰。',
        tour_guide_advice:
          '利用機上時間，將手機的 SIM 卡換好，並再次確認 Visit Japan Web (VJW) 的 QR Code 是否已截圖保存在手機相簿中，這能讓你下機後贏在起跑點。',
        must_list: ['必備：頸枕/眼罩', '重點：換SIM卡', '重點：VJW截圖'],
      },
    },
  },
  {
    id: 103,
    date: '08/05',
    type: 'sight',
    name: '後勤：羽田入境',
    timeStart: '00:45',
    timeEnd: '01:30',
    desc: 'VJW 快速通關',
    status: 'active',
    expenses: [],
    jp_name: '羽田空港 入国審査',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: '羽田機場 第三航廈',
        location_keyword: 'Haneda T3 Immigration',
        stay_time: '45m',
        one_line_tip: '目標 01:30 前進入大廳',
        tel: '+81-3-5757-8111',
      },
      details: {
        title: '深夜的羽田衝刺',
        content:
          '凌晨 00:45 落地。雖然深夜航班較少，但移民官的櫃檯也開得少。下機後，請不要猶豫，跟隨黃色的「Arrival」指標快步前進。此時你的手機應該已經連上網路，打開你的 VJW 藍色畫面（檢疫）與黃色畫面（入境審查）。我們的目標是在 45 分鐘內完成通關、領取行李並進入入境大廳。',
        tour_guide_advice:
          '如果遇到團體旅客，請靈活尋找較短的排隊動線。領到行李後，別忘了在海關申報機台掃描護照與 QR Code，這比人工通道快很多。',
        must_list: ['準備：VJW畫面', '行動：快步前進', '目標：速戰速決'],
      },
    },
  },
  {
    id: 104,
    date: '08/05',
    type: 'hub',
    name: 'HUB：深夜交通決策',
    timeStart: '01:30',
    timeEnd: '02:00',
    desc: '溫泉 vs 休息',
    status: 'active',
    expenses: [],
    jp_name: '羽田空港 第3ターミナル',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '深夜生存戰略',
        primary_info: '羽田機場 T3 入境大廳',
        location_keyword: 'Haneda Midnight Survival',
        stay_time: '30m',
        one_line_tip: '電車已收班，需做決策',
        tel: '+81-3-6459-9770',
      },
      details: {
        title: '電車收班後的選擇題',
        content:
          '歡迎來到凌晨 1:30 的東京。此時京急線與單軌電車早已收班。站在空蕩蕩的入境大廳，我們面臨幾個選擇。\n\n1. **泉天空之湯**：與航廈直結的 24 小時溫泉。雖然半夜有加成費用，但能泡個熱水澡並在躺椅區休息，是恢復體力的首選。\n2. **機場長椅**：T3 的 2 樓與 3 樓有不少長椅，這是最省錢但最累的方案（適合年輕人）。\n3. **深夜巴士**：前往新宿或池袋的巴士班次極少且需確認是否有位。\n\n考慮到明天要早起去新宿搭車，保持體力是關鍵。',
        tour_guide_advice:
          '如果預算允許，直接入住與 T3 直結的 **Villa Fontaine Grand** 飯店是最完美的選擇，能夠在床上好好睡這寶貴的 3 小時。',
        must_list: [
          '推薦：泉天空之湯',
          '奢華：Villa Fontaine',
          '備案：機場長椅',
        ],
      },
    },
  },
  {
    id: 105,
    date: '08/05',
    type: 'sight',
    name: '住宿：羽田機場',
    timeStart: '02:00',
    timeEnd: '05:00',
    desc: '短暫休息',
    status: 'active',
    expenses: [],
    jp_name: '羽田空港',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        primary_info: '羽田機場周邊 / 休息區',
        location_keyword: 'Haneda Airport Stay',
        stay_time: '3hr',
        one_line_tip: '設定 05:00 鬧鐘',
        tel: 'N/A',
      },
      details: {
        title: '黎明前的養精蓄銳',
        content:
          '無論你選擇了溫泉躺椅、飯店軟床還是機場長椅，現在請放下手機，戴上眼罩，強迫自己入睡。明天一早 05:26 我們就要搭乘首班電車前往新宿。這短短的 3 小時睡眠，將決定你明天在富士山下的精神狀態。晚安，東京。',
        must_list: ['重點：設定鬧鐘', '重點：手機充電', '心態：能睡就睡'],
      },
    },
  },

  // --- Day 2: 2026/08/06 (新宿出發 -> 山梨自駕 -> 花火場勘) ---
  {
    id: 200,
    date: '08/06',
    type: 'hub',
    name: '起點：羽田機場 T3',
    timeStart: '05:00',
    timeEnd: '05:26',
    desc: '旅程開始',
    status: 'active',
    expenses: [],
    jp_name: '羽田空港第3ターミナル',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '起點',
        primary_info: '起點：羽田機場 T3',
        location_keyword: 'Haneda Airport T3',
        stay_time: '26m',
        one_line_tip: '西瓜卡餘額確認，直奔京急線',
      },
      details: {
        title: '旅程起點',
        content:
          '早晨的羽田機場較為冷清，確保 Suica/Pasmo 餘額充足後，跟隨指標直接前往京急線月台，準備搭乘首班車前往市區。建議先在機場超商買瓶水，開啟這趟特種兵之旅。',
      },
    },
  },
  {
    id: 201,
    date: '08/06',
    type: 'transport',
    name: '移動：羽田 T3 ➡ 新宿',
    timeStart: '05:26',
    timeEnd: '06:12',
    desc: '京急線轉大江戶線',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：46m',
        transport_mode: 'train',
        primary_info: '京急空港線快特',
        secondary_info: '大門站轉乘大江戶線',
      },
      details: {
        title: '早朝移動',
        content:
          '搭乘京急空港線快特 (直通都營淺草線)，於「大門站」轉乘都營大江戶線前往新宿。這是一條避開早晨山手線擁擠的聰明路線。',
      },
    },
  },
  {
    id: 202,
    date: '08/06',
    type: 'hub',
    name: '新宿站 (大江戶線)',
    timeStart: '06:12',
    timeEnd: '06:30',
    desc: '站內移動',
    status: 'active',
    expenses: [],
    jp_name: '新宿駅',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '站內導航',
        primary_info: '新宿站 (大江戶線)',
        location_keyword: 'Shinjuku Station Oedo Line',
        stay_time: '18m',
        one_line_tip: '目標：尋找「新南改札」方向',
      },
      details: {
        title: '新宿迷宮攻略',
        content:
          '大江戶線新宿站位於地下深處 (淺紫色系)。下車後請抬頭尋找黃色出口指標，目標是「新南改札」方向，這是前往 BUSTA 新宿最近的路徑。',
      },
    },
  },
  {
    id: 203,
    date: '08/06',
    type: 'transport',
    name: '移動：站內 ➡ BUSTA',
    timeStart: '06:30',
    timeEnd: '06:45',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'walk',
        primary_info: '搭乘直達電梯至 4F',
        secondary_info: '直結 BUSTA 新宿',
      },
      details: {
        title: '轉乘邏輯',
        content:
          '從地下月台搭乘直達電梯或手扶梯，直接前往 4F 的「高速巴士總站 (Busta Shinjuku)」。',
      },
    },
  },
  {
    id: 204,
    date: '08/06',
    type: 'hub',
    name: 'BUSTA 新宿 4F',
    timeStart: '06:45',
    timeEnd: '07:05',
    desc: '巴士候車',
    status: 'active',
    expenses: [],
    jp_name: 'バスタ新宿',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '待機',
        primary_info: 'BUSTA 新宿 4F',
        location_keyword: 'Busta Shinjuku',
        stay_time: '20m',
        one_line_tip: '建議在同層全家買早餐',
      },
      details: {
        title: '出發前的準備',
        content:
          '這裡有全家便利商店，建議買好早餐與飲料。接下來的巴士車程約 2 小時，車上允許飲食。請確認電子車票或 QR Code 已準備好。',
      },
    },
  },
  {
    id: 205,
    date: '08/06',
    type: 'transport',
    name: '移動：新宿 ➡ 甲府',
    timeStart: '07:05',
    timeEnd: '09:15',
    desc: '京王巴士 1501便',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：2hr 10m',
        transport_mode: 'bus',
        primary_info: '高速巴士 (京王)',
        secondary_info: '建議選左側座位 (看富士山)',
      },
      details: {
        title: '前往山梨',
        content:
          '搭乘京王巴士 1501 便前往甲府。行駛於中央自動車道，若天氣晴朗，建議選擇「左側座位」，沿途可以欣賞到壯麗的富士山景色。',
      },
    },
  },
  {
    id: 206,
    date: '08/06',
    type: 'sight',
    name: '租車：ORIX 甲府站前',
    timeStart: '09:15',
    timeEnd: '09:50',
    desc: '租車手續',
    status: 'active',
    expenses: [],
    jp_name: 'オリックスレンタカー甲府駅前',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        header: '自駕開始',
        primary_info: 'ORIX 租車 甲府站前',
        location_keyword: 'Orix Rent-A-Car Kofu',
        stay_time: '35m',
        one_line_tip: '檢查車身刮痕並拍照存證',
        tel: '055-233-0543',
      },
      details: {
        title: '自駕模式啟動',
        content:
          '辦理取車手續。務必檢查車身既有的刮痕並拍照留底。設定導航至第一個目的地，調整後照鏡與座椅，準備開始山梨的自駕冒險。',
        must_list: ['必備：台灣駕照', '必備：日文譯本', '任務：檢查ETC卡'],
      },
    },
  },
  {
    id: 207,
    date: '08/06',
    type: 'transport',
    name: '移動：租車點 ➡ 善光寺',
    timeStart: '09:50',
    timeEnd: '10:05',
    desc: '市區行駛',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'car',
        primary_info: '前往甲斐善光寺',
        secondary_info: '適應右駕的好時機',
      },
    },
  },
  {
    id: 208,
    date: '08/06',
    type: 'sight',
    name: '甲斐善光寺',
    timeStart: '10:05',
    timeEnd: '10:50',
    desc: '武田信玄淵源地',
    status: 'active',
    expenses: [],
    jp_name: '甲斐善光寺',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '歷史探訪',
        primary_info: '甲斐善光寺',
        location_keyword: 'Kai Zenkoji',
        stay_time: '45m',
        one_line_tip: '體驗本堂著名的「鳴龍」回音',
        tel: '055-233-7570',
      },
      details: {
        title: '武田家的信仰',
        content:
          '這是由武田信玄創建的古剎。巨大的山門與本堂極具氣勢。進入金堂參拜時，務必體驗著名的「鳴き龍」——在龍圖下方拍手，可以聽到獨特的共鳴回音。',
        history:
          '戰國時代武田信玄為了避免信州善光寺被戰火波及，將其本尊遷移至此，故稱為甲斐善光寺。',
        photo_advice:
          '使用廣角鏡頭由下往上拍攝本堂的雄偉氣勢，或利用參道的松樹作為前景。',
        must_list: [
          '體驗：鳴龍回音',
          '體驗：戒壇巡禮 (暗道)',
          '必看：巨大山門',
        ],
      },
    },
  },
  {
    id: 209,
    date: '08/06',
    type: 'transport',
    name: '移動：善光寺 ➡ 昇仙峽',
    timeStart: '10:50',
    timeEnd: '11:25',
    desc: '山路行駛',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：35m',
        transport_mode: 'car',
        primary_info: '前往昇仙峽',
        secondary_info: '山路蜿蜒，注意行車安全',
      },
    },
  },
  {
    id: 210,
    date: '08/06',
    type: 'sight',
    name: '昇仙峽 (仙娥滝)',
    timeStart: '11:25',
    timeEnd: '12:45',
    desc: '日本最美溪谷',
    status: 'active',
    expenses: [],
    jp_name: '昇仙峡',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '絕景攝影',
        primary_info: '昇仙峽 (仙娥滝)',
        location_keyword: 'Shosenkyo',
        stay_time: '1hr 20m',
        one_line_tip: '必帶 CPL 濾鏡，拍攝瀑布絲絹感',
        tel: '055-287-2111',
      },
      details: {
        title: '花崗岩的藝術',
        content:
          '被譽為日本最美溪谷之一。重點拍攝「仙娥滝」瀑布，花崗岩被長年侵蝕成奇岩怪石，景色壯麗。建議沿著溪谷步道散策，吸收芬多精。',
        history:
          '昇仙峽是御岳升仙峡的簡稱，是國家特別名勝，以其獨特的花崗岩斷崖與清澈溪流聞名。',
        photo_advice:
          '建議使用腳架與慢快門（搭配 ND 或 CPL 濾鏡）來表現水流的絲絹質感，並消除水面反光以凸顯岩石紋理。',
        must_list: ['必拍：仙娥瀑布', '必拍：覺圓峰', '必備：CPL濾鏡'],
      },
    },
  },
  {
    id: 211,
    date: '08/06',
    type: 'transport',
    name: '移動：昇仙峽 ➡ 午餐',
    timeStart: '12:45',
    timeEnd: '13:15',
    desc: '下坡',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'car',
        primary_info: '前往湯村溫泉區',
        secondary_info: '下坡路段請使用低速檔',
      },
    },
  },
  {
    id: 212,
    date: '08/06',
    type: 'food',
    name: '炸豬排 Kitchen 美味小家',
    timeStart: '13:15',
    timeEnd: '14:15',
    desc: 'Tabelog 百名店',
    status: 'active',
    expenses: [],
    jp_name: 'キッチン美味小家',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '必吃午餐',
        primary_info: '炸豬排 Kitchen 美味小家',
        location_keyword: 'Kitchen Bimishoya',
        stay_time: '1hr',
        one_line_tip: 'Tabelog 百名店，推薦金華豚',
        tel: '055-252-7215',
      },
      details: {
        title: '巷弄裡的炸豬排傳奇',
        content:
          '【美食家推薦】隱身於湯村溫泉街的實力派名店，連續多年入選 Tabelog 百名店。老闆對豬肉品種極度講究，提供「金華豚」、「高座豚」等稀有品牌豬。這裡的豬排不建議淋醬，而是沾取「岩鹽」食用，能最大限度地引出脂肪的甘甜與肉質的鮮美。',
        must_eat: [
          '金華豚ロース (金華豚里肌)',
          '厚切りヒレカツ (厚切菲力)',
          '岩鹽食用法',
        ],
      },
    },
  },
  {
    id: 213,
    date: '08/06',
    type: 'transport',
    name: '移動：午餐 ➡ 花火東岸',
    timeStart: '14:15',
    timeEnd: '14:45',
    desc: '前往會場',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'car',
        primary_info: '前往東岸堤防',
        secondary_info: '堤防道路注意會車',
      },
    },
  },
  {
    id: 214,
    date: '08/06',
    type: 'scouting',
    name: '場勘：神明花火 (東岸)',
    timeStart: '14:45',
    timeEnd: '15:15',
    desc: '場勘',
    status: 'active',
    expenses: [],
    jp_name: '神明の花火大会 東岸',
    aiData: {
      category: 'scouting',
      theme: 'cyan',
      summary: {
        header: '攝點確認',
        primary_info: '神明花火 (東岸)',
        location_keyword: '35.555, 138.493',
        stay_time: '30m',
        one_line_tip: '確認腳架空間與視野遮蔽',
        photo_guide: '廣角構圖確認',
      },
      details: {
        title: 'Plan A 確認',
        content:
          '【場勘邏輯】座標 35.555, 138.493。這是順風時的最佳拍攝點。請確認河堤的草長度是否會遮擋前景，以及是否有足夠的空間架設腳架而不影響他人通道。',
      },
    },
  },
  {
    id: 215,
    date: '08/06',
    type: 'transport',
    name: '移動：東岸 ➡ 西岸',
    timeStart: '15:15',
    timeEnd: '15:45',
    desc: '跨橋',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'car',
        primary_info: '前往西岸高台',
        secondary_info: '需跨越橋梁，注意車流',
      },
    },
  },
  {
    id: 216,
    date: '08/06',
    type: 'scouting',
    name: '場勘：神明花火 (西岸)',
    timeStart: '15:45',
    timeEnd: '16:15',
    desc: '場勘',
    status: 'active',
    expenses: [],
    jp_name: '神明の花火大会 西岸',
    aiData: {
      category: 'scouting',
      theme: 'cyan',
      summary: {
        header: '攝點確認',
        primary_info: '神明花火 (西岸)',
        location_keyword: '35.583, 138.443',
        stay_time: '30m',
        one_line_tip: '確認農道停車狀況與迴轉',
        photo_guide: '長焦壓縮構圖確認',
      },
      details: {
        title: 'Plan B 確認',
        content:
          '【場勘邏輯】座標 35.583, 138.443。這是逆風時的避難所，位於高地。重點確認農道是否允許停車，以及夜間撤退時的動線是否順暢。',
      },
    },
  },
  {
    id: 217,
    date: '08/06',
    type: 'transport',
    name: '移動：西岸 ➡ 溫泉',
    timeStart: '16:15',
    timeEnd: '17:00',
    desc: '上山',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：45m',
        transport_mode: 'car',
        primary_info: '前往 Hottarakashi 溫泉',
        secondary_info: '橫跨盆地，景色開闊',
      },
    },
  },
  {
    id: 218,
    date: '08/06',
    type: 'sight',
    name: 'Hottarakashi 溫泉',
    timeStart: '17:00',
    timeEnd: '18:30',
    desc: '絕景露天溫泉',
    status: 'active',
    expenses: [],
    jp_name: 'ほったらかし温泉',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '放鬆時刻',
        primary_info: 'Hottarakashi 溫泉',
        location_keyword: 'Hottarakashi Onsen',
        stay_time: '1hr 30m',
        one_line_tip: '推薦「那邊之湯」視野最廣',
        photo_guide: '日落前後是魔幻時刻 (停車場拍)',
        tel: '0553-23-1526',
      },
      details: {
        title: '天空之湯',
        content:
          '這裡擁有甲府盆地最開闊的視野。推薦選擇「あっちの湯 (那邊之湯)」。日落前後是魔幻時刻，可以同時欣賞到夕陽餘暉與盆地初上的華燈。注意：溫泉內嚴禁攝影，風景照請在休息區拍攝。',
        history:
          '以「放任不管 (Hottarakashi)」為名，主打不提供過度服務，讓客人純粹享受絕景與溫泉的獨特經營理念。',
        must_list: [
          '體驗：露天風呂',
          '必吃：溫泉炸蛋 (温玉揚げ)',
          '必看：富士山日落',
        ],
      },
    },
  },
  {
    id: 219,
    date: '08/06',
    type: 'transport',
    name: '移動：溫泉 ➡ 甲府站',
    timeStart: '18:30',
    timeEnd: '19:10',
    desc: '返回市區',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：40m',
        transport_mode: 'car',
        primary_info: '前往甲府站前',
        secondary_info: '下山路段，注意下班車潮',
      },
    },
  },
  {
    id: 220,
    date: '08/06',
    type: 'food',
    name: '奧藤本店 甲府站前',
    timeStart: '19:10',
    timeEnd: '20:10',
    desc: '甲府鳥內臟煮',
    status: 'active',
    expenses: [],
    jp_name: '奥藤本店 甲府駅前店',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '名物晚餐',
        primary_info: '奧藤本店 甲府站前',
        location_keyword: 'Okutou Honten Kofu',
        stay_time: '1hr',
        one_line_tip: '甲府鳥內臟煮發源地 (B-1冠軍)',
        tel: '055-232-0910',
      },
      details: {
        title: '甲府靈魂美食',
        content:
          '【美食家推薦】來到甲府，這是一間繞不開的百年老店。作為「甲府鳥內臟煮」的發祥地，這裡定義了這道 B 級美食的標準味道。濃郁的醬油糖漿緊緊包裹著新鮮的雞肝、雞胗與雞心，在口中爆發出鹹甜交織的強烈風味。搭配店家自豪的手打蕎麥麵，是甲府人最道地的待客之道。',
        must_eat: [
          '甲府鳥もつ煮 (甲府鳥內臟煮)',
          '手打ちそば (手打蕎麥麵)',
          '甲州名物馬刺し (馬肉刺身)',
        ],
      },
    },
  },
  {
    id: 221,
    date: '08/06',
    type: 'transport',
    name: '移動：晚餐 ➡ 飯店',
    timeStart: '20:10',
    timeEnd: '20:30',
    desc: '回飯店',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：20m',
        transport_mode: 'car',
        primary_info: '前往東橫INN',
        secondary_info: '確認飯店停車場入口',
      },
    },
  },
  {
    id: 222,
    date: '08/06',
    type: 'sight',
    name: '東橫INN 甲府站南口1',
    timeStart: '20:30',
    timeEnd: '23:59',
    desc: '住宿休息',
    status: 'active',
    expenses: [],
    jp_name: '東横INN甲府駅南口1',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '住宿',
        primary_info: '東橫INN 甲府站南口1',
        location_keyword: 'Toyoko Inn Kofu Station South 1',
        stay_time: 'Overnight',
        one_line_tip: '任務：查看 Windy 決定明日風向',
        tel: '055-226-1045',
      },
      details: {
        title: '戰略會議',
        content:
          '辦理入住後，請打開 Windy App 查看明天下午市川三鄉町的風向預報。這將決定明天花火大會是要去「東岸 (順風)」還是「西岸 (逆風避難)」。整理器材，將相機電池充飽，明天將是此次旅程的重頭戲。',
      },
    },
  },

  // --- Day 3: 2026/08/07 (甲府歴史散策 & 神明花火決戦) ---
  {
    id: 300,
    date: '08/07',
    type: 'hub',
    name: '退房：東橫INN',
    timeStart: '07:00',
    timeEnd: '07:15',
    desc: 'Check-out',
    status: 'active',
    expenses: [],
    jp_name: '東横INN甲府駅南口1',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '出發',
        primary_info: '東橫INN 甲府站南口1',
        location_keyword: 'Toyoko Inn Kofu Station South 1',
        stay_time: '15m',
        one_line_tip: '寄放行李或確認車內物品',
      },
      details: {
        title: '決戰日的早晨',
        content:
          '今天是神明花火大會的日子，也是山梨縣最熱鬧的一天。辦理退房手續。若接下來不租車，請將大件行李寄放在飯店；若續租或有車，請確認所有行李已上車。準備迎接漫長而精彩的一天。',
      },
    },
  },
  {
    id: 301,
    date: '08/07',
    type: 'transport',
    name: '移動：飯店 ➡ 加油站',
    timeStart: '07:15',
    timeEnd: '07:30',
    desc: '開車',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'car',
        primary_info: '前往 ENEOS 加油站',
        secondary_info: '還車前補給',
      },
      details: {
        title: '最後一段自駕',
        content: '前往租車公司附近的加油站。早晨市區車流較少，可以輕鬆駕駛。',
      },
    },
  },
  {
    id: 302,
    date: '08/07',
    type: 'sight',
    name: '加油：ENEOS 甲府北店',
    timeStart: '07:30',
    timeEnd: '07:45',
    desc: '滿油還車',
    status: 'active',
    expenses: [],
    jp_name: 'ENEOS Dr.Drive 甲府北店',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        header: '加油任務',
        primary_info: 'ENEOS Dr.Drive 甲府北店',
        location_keyword: 'ENEOS Kofu Kita',
        stay_time: '15m',
        one_line_tip: '加滿 Regular 並保留收據',
        tel: '055-252-8566',
      },
      details: {
        title: '還車前的義務',
        content:
          '前往租車公司指定的加油站（或最近的加油站）將油箱加滿。請務必保留加油收據，還車時工作人員會檢查。',
        must_list: [
          '任務：加滿油(Regular)',
          '任務：保留收據',
          '任務：清理車內垃圾',
        ],
      },
    },
  },
  {
    id: 303,
    date: '08/07',
    type: 'transport',
    name: '移動：加油站 ➡ ORIX',
    timeStart: '07:45',
    timeEnd: '08:00',
    desc: '前往還車',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'car',
        primary_info: '前往 ORIX 甲府站前店',
        secondary_info: '自駕行程結束',
      },
      details: {
        title: '歸還車輛',
        content:
          '開往 ORIX 租車甲府站前店。請再次確認車內沒有遺留個人物品（手機架、充電線、ETC卡）。',
      },
    },
  },
  {
    id: 304,
    date: '08/07',
    type: 'sight',
    name: '還車：ORIX 甲府站前',
    timeStart: '08:00',
    timeEnd: '08:15',
    desc: '還車手續',
    status: 'active',
    expenses: [],
    jp_name: 'オリックスレンタカー甲府駅前',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        header: '自駕結束',
        primary_info: 'ORIX 租車 甲府站前店',
        location_keyword: 'ORIX Rent-A-Car Kofu',
        stay_time: '15m',
        one_line_tip: '出示加油收據，取回押金',
        tel: '055-233-0543',
      },
      details: {
        title: '告別自駕模式',
        content:
          '準時在 08:00 店家開門時抵達。辦理還車手續，結束這幾天的自駕行程。接下來我們將切換回「雙腳 + 大眾運輸」的模式。請特別檢查 ETC 卡是否拔除。',
        must_list: [
          '任務：拔除ETC卡',
          '任務：出示加油收據',
          '檢查：後車廂/門邊',
        ],
      },
    },
  },
  {
    id: 305,
    date: '08/07',
    type: 'transport',
    name: '移動：ORIX ➡ 舞鶴城',
    timeStart: '08:15',
    timeEnd: '08:25',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：10m',
        transport_mode: 'walk',
        primary_info: '前往舞鶴城公園',
        secondary_info: '穿越車站',
      },
      details: {
        title: '早晨散步',
        content: '從租車店步行前往舞鶴城公園。早晨的空氣清新，適合散步。',
      },
    },
  },
  {
    id: 306,
    date: '08/07',
    type: 'sight',
    name: '舞鶴城公園 (甲府城跡)',
    timeStart: '08:25',
    timeEnd: '09:15',
    desc: '遠眺富士山',
    status: 'active',
    expenses: [],
    jp_name: '舞鶴城公園',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '歷史絕景',
        primary_info: '舞鶴城公園 (甲府城跡)',
        location_keyword: 'Maizuru Castle Park',
        stay_time: '50m',
        one_line_tip: '登天守台看富士山',
        tel: '055-227-6179',
      },
      details: {
        title: '曾經的甲斐守護',
        content:
          '雖然天守閣已不復存在，但雄偉的石垣仍訴說著當年的歷史。站在最高處的天守台，可以 360 度俯瞰甲府市區。如果運氣好，往南看去，富士山完美的錐形山體就會出現在眼前。',
        history:
          '甲府城別名舞鶴城，是豐臣秀吉為了牽制德川家康而下令建造的重鎮。',
        photo_advice:
          '利用前景的城牆石塊作為引導線，將視線引導至遠方的富士山。早晨側光能凸顯石塊的立體感。',
        must_list: ['必拍：天守台展望', '必拍：富士山遠景', '散步：日式庭園'],
      },
    },
  },
  {
    id: 307,
    date: '08/07',
    type: 'transport',
    name: '移動：舞鶴城 ➡ 夢小路',
    timeStart: '09:15',
    timeEnd: '09:30',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'walk',
        primary_info: '前往甲州夢小路',
        secondary_info: '跨過鐵道天橋',
      },
      details: {
        title: '前往復古街區',
        content: '步行前往車站北口的甲州夢小路。沿途可以欣賞鐵道風景。',
      },
    },
  },
  {
    id: 308,
    date: '08/07',
    type: 'sight',
    name: '甲州夢小路',
    timeStart: '09:30',
    timeEnd: '10:20',
    desc: '復古街區',
    status: 'active',
    expenses: [],
    jp_name: '甲州夢小路',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '懷舊散策',
        primary_info: '甲州夢小路',
        location_keyword: 'Koshu Yumekouji',
        stay_time: '50m',
        one_line_tip: '明治大正風情建築',
        tel: '055-298-6300',
      },
      details: {
        title: '時光倒流的散策',
        content:
          '位於甲府車站北口旁的復古街區，重現了明治、大正時期的甲府城下町風貌。石板路、白壁倉庫、以及地標性的「時之鐘」，營造出濃厚的懷舊氛圍。',
        history:
          '重現了昔日甲府城下町的繁榮景象，集合了許多販售山梨縣產葡萄酒、寶石飾品與和紙雜貨的特色小店。',
        photo_advice:
          '等待身延線或中央線的列車經過時，拍攝復古的「時之鐘」與現代電車同框的畫面，形成有趣的時代對比。',
        must_list: ['必拍：時之鐘', '必買：甲州葡萄酒', '必吃：葡萄果汁'],
      },
    },
  },
  {
    id: 309,
    date: '08/07',
    type: 'transport',
    name: '移動：夢小路 ➡ 武田神社',
    timeStart: '10:20',
    timeEnd: '10:50',
    desc: '巴士',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'bus',
        primary_info: '搭乘山梨交通巴士',
        secondary_info: '前往武田神社',
      },
      details: {
        title: '前往聖地',
        content:
          '在甲府站北口搭乘巴士前往武田神社。這是一條筆直的道路，直通神社鳥居。',
      },
    },
  },
  {
    id: 310,
    date: '08/07',
    type: 'sight',
    name: '武田神社',
    timeStart: '10:50',
    timeEnd: '11:50',
    desc: '戰國名將聖地',
    status: 'active',
    expenses: [],
    jp_name: '武田神社',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '勝運祈願',
        primary_info: '武田神社',
        location_keyword: 'Takeda Shrine',
        stay_time: '1hr',
        one_line_tip: '參拜勝運之神',
        tel: '055-252-2609',
      },
      details: {
        title: '風林火山的信仰中心',
        content:
          '建立在戰國名將武田信玄的居所「躑躅崎館」遺跡之上。對於熟悉日本戰國史的人來說，這裡是絕對的聖地。神社內供奉著武田信玄，被視為「勝運」之神。',
        history:
          '信玄公在此居住了50多年，雖無巨大天守閣，但「人即城、人即石垣、人即堀」的名言便源於此地。',
        photo_advice:
          '正面的神橋與鳥居是經典構圖。寶物殿內收藏有信玄公的軍扇與鎧甲。',
        must_list: ['必拜：勝運祈願', '必看：姬之井戶', '必買：風林火山御守'],
      },
    },
  },
  {
    id: 311,
    date: '08/07',
    type: 'transport',
    name: '移動：武田神社 ➡ 甲府站',
    timeStart: '11:50',
    timeEnd: '12:10',
    desc: '巴士',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：20m',
        transport_mode: 'bus',
        primary_info: '返回甲府車站',
        secondary_info: '準備午餐',
      },
      details: {
        title: '返回市區',
        content: '搭乘巴士返回甲府車站北口。準備享用午餐。',
      },
    },
  },
  {
    id: 312,
    date: '08/07',
    type: 'food',
    name: '丸政 (Marumasa)',
    timeStart: '12:10',
    timeEnd: '13:40',
    desc: '山賊燒與蕎麥麵',
    status: 'active',
    expenses: [],
    jp_name: '丸政 甲府北口店',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '必吃午餐',
        primary_info: '丸政 甲府北口店',
        location_keyword: 'Marumasa Kofu Kitaguchi',
        stay_time: '1hr 30m',
        one_line_tip: '必點山賊燒蕎麥麵',
        tel: '055-252-7886',
      },
      details: {
        title: '站前的豪邁滋味',
        content:
          '【美食分析】\n**空間氛圍**：輕鬆的站前食堂氛圍，適合旅人快速補充能量。\n**味蕾報告**：招牌「山賊燒」是巨大的炸雞排，外皮酥脆，帶有蒜味醬油的香氣，肉質多汁。搭配蕎麥麵的柴魚湯頭，解膩又滿足。\n**點餐攻略**：強烈推薦「山賊蕎麥麵 (山賊そば)」，份量十足，CP值極高。',
        must_eat: [
          '山賊そば (山賊蕎麥麵)',
          '山賊揚げ (單點炸雞)',
          '黄そば (中華麵條版)',
        ],
      },
    },
  },
  {
    id: 313,
    date: '08/07',
    type: 'transport',
    name: '移動：丸政 ➡ CELEO',
    timeStart: '13:40',
    timeEnd: '13:50',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：10m',
        transport_mode: 'walk',
        primary_info: '前往 CELEO 百貨',
        secondary_info: '穿越車站',
      },
      details: {
        title: '前往補給',
        content: '從北口穿越車站自由通道前往南口的 CELEO 百貨。',
      },
    },
  },
  {
    id: 314,
    date: '08/07',
    type: 'sight',
    name: '購物：CELEO 百貨',
    timeStart: '13:50',
    timeEnd: '14:40',
    desc: '物資補給',
    status: 'active',
    expenses: [],
    jp_name: 'セレオ甲府',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '後勤補給',
        primary_info: 'CELEO 甲府',
        location_keyword: 'CELEO Kofu',
        stay_time: '50m',
        one_line_tip: '購買花火大會飲食',
        tel: '055-224-2611',
      },
      details: {
        title: '最後的後勤補給站',
        content:
          '與甲府車站直結的百貨商場。這裡是前往花火會場前，購買「戰備糧食」的最佳地點。建議在這裡的超市或熟食區買好飯糰、炸物、飲料（特別是水！），甚至是一些解饞的零食。',
        history: '車站直結的便利設施，是甲府市民與遊客的重要據點。',
        photo_advice: '無特殊攝影建議，專注於採買。',
        must_list: ['必買：足夠飲用水', '必買：輕食便當', '必買：濕紙巾'],
      },
    },
  },
  {
    id: 315,
    date: '08/07',
    type: 'transport',
    name: '移動：甲府 ➡ 花火會場',
    timeStart: '14:40',
    timeEnd: '15:40',
    desc: 'JR 身延線',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr',
        transport_mode: 'train',
        primary_info: 'JR 身延線',
        secondary_info: '甲府 -> 市川大門',
      },
      details: {
        title: '前往花火之里',
        content:
          '搭乘 JR 身延線前往「市川大門站」。車程約 40 分鐘，加上步行時間。隨著列車接近目的地，車廂內穿著浴衣的人會越來越多。務必在甲府站買好「紙本來回車票」，以免回程被 IC 卡閘門卡住。',
      },
    },
  },
  {
    id: 316,
    date: '08/07',
    type: 'scouting',
    name: '場勘：拍攝點決策',
    timeStart: '15:40',
    timeEnd: '19:15',
    desc: '待機',
    status: 'active',
    expenses: [],
    jp_name: '神明の花火大会 会場',
    aiData: {
      category: 'scouting',
      theme: 'cyan',
      summary: {
        header: '待機',
        primary_info: '神明花火 拍攝點',
        location_keyword: 'Ichikawamisato Fireworks Venue',
        stay_time: '3hr 35m',
        one_line_tip: '依風向決定位置，佔位待機',
        photo_guide: '確認構圖與水平',
      },
      details: {
        title: '風的對決與守候',
        content:
          '抵達會場後，依據昨晚確認的風向（Windy），決定前往東岸（順風廣角）或西岸（逆風避難）。找到位置後，架好腳架，用野餐墊佔位。這段漫長的等待時間，可以用來微調構圖、上廁所、享用在 CELEO 買的美食。',
        history: '神明花火是山梨縣規模最大的花火大會，擁有悠久的歷史。',
        photo_advice:
          '確認地平線水平，預對焦在無限遠（或遠處建築物）。試拍幾張確認曝光。',
        must_list: ['任務：確認風向', '任務：佔位固定', '任務：防蚊防曬'],
      },
    },
  },
  {
    id: 317,
    date: '08/07',
    type: 'sight',
    name: '神明花火大會',
    timeStart: '19:15',
    timeEnd: '21:00',
    desc: '2萬發的震撼',
    status: 'active',
    expenses: [],
    jp_name: '神明の花火大会',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '花火大會',
        primary_info: '神明花火大會',
        location_keyword: 'Shinmei Fireworks',
        stay_time: '1hr 45m',
        one_line_tip: '二尺玉與主題花火',
        tel: '055-272-1101',
      },
      details: {
        title: '燃燒夜空的兩萬發詩篇',
        content:
          '神明花火以「故事性」與「色彩層次」聞名。整場演出像是一部電影，有起承轉合。最令人期待的是「二尺玉」的高空炸裂，那種聲音會穿透胸腔。以及最後的「Grand Finale」，超廣幅的彩虹花火將會填滿你的整個視野。',
        history: '江戶時代此地就是花火產地，傳承至今。',
        photo_advice:
          '使用 B 快門 (Bulb)，光圈 F8-F11，ISO 100。配合快門線，在花火升空時按下，綻放結束後放開。對於連續發射的 Star Mine，可以使用「黑卡」遮擋鏡頭，避免過曝。',
        must_list: ['必拍：二尺玉', '必拍：彩虹花火', '體驗：全身震動'],
      },
    },
  },
  {
    id: 318,
    date: '08/07',
    type: 'transport',
    name: '移動：會場 ➡ 甲府',
    timeStart: '21:00',
    timeEnd: '23:30',
    desc: '撤收地獄',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：2hr 30m',
        transport_mode: 'train',
        primary_info: '步行至車站 + JR 身延線',
        secondary_info: '人潮極度擁擠',
      },
      details: {
        title: '最艱難的一哩路',
        content:
          '花火結束後，隨即開始撤收。市川大門站會有嚴格的入場管制，排隊時間可能很長。請保持耐心，這是一場體力與意志力的考驗。手中如果有紙本車票，進站速度會稍微快一點。',
      },
    },
  },
  {
    id: 319,
    date: '08/07',
    type: 'food',
    name: '宵夜：甲府站南口',
    timeStart: '23:30',
    timeEnd: '00:30',
    desc: '深夜食堂',
    status: 'active',
    expenses: [],
    jp_name: '甲府駅南口周辺',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '深夜慰藉',
        primary_info: '甲府站南口周邊居酒屋',
        location_keyword: 'Kofu Station South Exit Izakaya',
        stay_time: '1hr',
        one_line_tip: 'Hana no Mai 或 24h 牛丼',
        tel: 'N/A',
      },
      details: {
        title: '疲憊靈魂的救贖',
        content:
          '【美食分析】\n**空間氛圍**：回到甲府站南口，雖然時間已晚，但連鎖居酒屋如「Hana no Mai (はなの舞)」或「Kuimonoya Wan (くいもの屋わん)」通常營業至深夜。或者選擇 24 小時的 Sukiya 牛丼。\n**味蕾報告**：此刻最需要的是一杯冰涼的生啤酒與熱騰騰的碳水化合物。\n**點餐攻略**：快速出餐的熱食與啤酒。',
        must_eat: ['生啤酒', '熱湯/拉麵', '牛丼'],
      },
    },
  },
  {
    id: 320,
    date: '08/07',
    type: 'transport',
    name: '移動：宵夜點 ➡ 巴士站',
    timeStart: '00:30',
    timeEnd: '00:40',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：10m',
        transport_mode: 'walk',
        primary_info: '前往巴士乘車處',
        secondary_info: '準備搭乘夜巴',
      },
      details: {
        title: '前往下一站',
        content: '步行前往甲府站南口的巴士乘車處。',
      },
    },
  },
  {
    id: 321,
    date: '08/07',
    type: 'hub',
    name: '甲府站南口 (巴士待機)',
    timeStart: '00:40',
    timeEnd: '01:10',
    desc: '巴士待機',
    status: 'active',
    expenses: [],
    jp_name: '甲府駅南口 バスターミナル',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '轉運',
        primary_info: '甲府站南口 巴士乘車處',
        location_keyword: 'Kofu Station Bus Terminal',
        stay_time: '30m',
        one_line_tip: '確認巴士班次與位置',
      },
      details: {
        title: '再見甲府',
        content:
          '在深夜的巴士站等待。整理一下隨身行李，將頸枕拿出，準備在夜行巴士上補眠。這三天在山梨的冒險畫下句點。',
      },
    },
  },
  {
    id: 322,
    date: '08/07',
    type: 'transport',
    name: '移動：甲府 ➡ 下一站',
    timeStart: '01:10',
    timeEnd: '02:00',
    desc: '夜行巴士',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：50m+',
        transport_mode: 'bus',
        primary_info: '夜行巴士',
        secondary_info: '前往下一個目的地',
      },
      details: {
        title: '夢中移動',
        content:
          '搭乘夜行巴士前往下一個目的地（如京都或大阪）。在車上好好休息。',
      },
    },
  },

  // --- Day 4: 08/08 (長途交通與京都後勤) ---
  // 1. Hub: 甲府車站 (夜巴下車站)
  {
    id: 400,
    date: '08/08',
    type: 'sight',
    name: '甲府車站南出口',
    timeStart: '01:10',
    timeEnd: '01:10',
    desc: '夜巴上車點',
    status: 'active',
    expenses: [],
    jp_name: '甲府駅',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '起點 (夜巴上車)',
        location_keyword: '甲府車站南出口',
        stay_time: '0m',
        one_line_tip: '縣會議事堂前',
      },
      details: { title: '甲府車站南出口', content: '夜行巴士上車點。' },
    },
  },
  // 2. Transport: 夜行巴士 (長程移動)
  {
    id: 4001,
    date: '08/08',
    type: 'transport',
    name: '甲府 > 京都 夜行巴士',
    timeStart: '01:10',
    timeEnd: '07:20',
    desc: 'WILLER NP181',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：6hr 10m',
        transport_mode: 'public',
        primary_info: 'WILLER NP181',
        secondary_info: '車上過夜',
        tertiary_info: '甲府站南口 -> 京都站八条口',
      },
      details: {
        title: '搖晃中的夢鄉',
        content:
          '結束了震撼的花火大會，身體雖然疲憊，心靈卻是滿足的。在夜行巴士上隨著車身輕晃進入夢鄉，醒來時將是古都京都的清晨。',
      },
    },
  },
  // 3. Hub: 京都站八条口 (夜巴抵達)
  {
    id: 4002,
    date: '08/08',
    type: 'sight',
    name: '京都站 八条口',
    timeStart: '07:20',
    timeEnd: '07:20',
    desc: 'G2 公交车站',
    status: 'active',
    expenses: [],
    jp_name: '京都駅',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '抵達 (夜巴下車)',
        location_keyword: '京都站 八条口',
        stay_time: '0m',
        one_line_tip: 'G2 公交车站',
      },
      details: {
        title: '京都的早晨',
        content: '抵達京都，準備開始今天的琵琶湖行程。',
      },
    },
  },
  // 4. Transport: 步行至飯店
  {
    id: 4003,
    date: '08/08',
    type: 'transport',
    name: '移動：步行至飯店',
    timeStart: '07:20',
    timeEnd: '07:40',
    desc: '短程步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：20m',
        transport_mode: 'walk',
        primary_info: '八条口 -> 相鐵弗雷薩',
        secondary_info: '尋找寄放地點',
      },
    },
  },
  // 5. Logistics: 行李寄放 (玫瑰色)
  {
    id: 401,
    date: '08/08',
    type: 'sight',
    name: '後勤：行李寄放 (相鐵)',
    timeStart: '07:40',
    timeEnd: '08:00',
    desc: '京都八條口相鐵弗雷薩',
    status: 'active',
    expenses: [],
    jp_name: '京都駅',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: '京都八條口相鐵弗雷薩',
        location_keyword: '相鐵弗雷薩寄放處',
        stay_time: '20m',
        one_line_tip: '確保所有行李寄放完畢',
      },
      details: {
        title: '後勤準備',
        content:
          '在京都站寄放行李，為接下來的琵琶湖自駕做準備。確保將所有貴重物品隨身攜帶，只留下不需要的行李。',
      },
    },
  },
  // 6. Transport: 步行至租車店
  {
    id: 4011,
    date: '08/08',
    type: 'transport',
    name: '移動：步行至租車店',
    timeStart: '08:00',
    timeEnd: '08:05',
    desc: '短程步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：5m',
        transport_mode: 'walk',
        primary_info: '飯店 -> ORIX',
        secondary_info: '京都車站周邊',
      },
    },
  },
  // 7. Logistics: 租車手續 (玫瑰色)
  {
    id: 402,
    date: '08/08',
    type: 'sight',
    name: '租車：ORIX 手續',
    timeStart: '08:05',
    timeEnd: '08:35',
    desc: '京都駅前新幹線口店',
    status: 'active',
    expenses: [],
    jp_name: 'オリックスレンタカー',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: 'ORIX 租車 新幹線口店',
        location_keyword: 'オリックスレンタカー 京都駅前新幹線口店',
        stay_time: '30m',
        one_line_tip: '檢查車身，確認ETC卡',
      },
      details: {
        title: '自駕開始',
        content:
          '從京都站租車前往琵琶湖，這是今天長距離移動的關鍵。務必再次確認右駕的習慣和導航系統的使用。',
      },
    },
  },
  // 8. Transport: 長途移動
  {
    id: 4021,
    date: '08/08',
    type: 'transport',
    name: '移動：京都 ➡ 白鬚神社',
    timeStart: '08:35',
    timeEnd: '10:20',
    desc: '經高速或161國道',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr 45m',
        transport_mode: 'car',
        primary_info: '經高速或161國道',
        secondary_info: '離開京都市區',
      },
    },
  },
  // 9. Activity: 白鬚神社
  {
    id: 403,
    date: '08/08',
    type: 'sight',
    name: '白鬚神社',
    timeStart: '10:20',
    timeEnd: '12:20',
    desc: '水中鳥居',
    status: 'active',
    expenses: [],
    jp_name: '白鬚神社',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        location_keyword: 'Shirahige Shrine',
        stay_time: '2hr',
        photo_guide: '長焦鳥居',
        primary_info: '白鬚神社',
      },
      details: {
        title: '近江的嚴島',
        content:
          '矗立在琵琶湖中的朱紅鳥居，是攝影師必訪的聖地。清晨的光線通常最適合拍攝。',
      },
    },
  },

  // --- A 路線 A (西岸名景) ---
  {
    id: 4031,
    date: '08/08',
    type: 'transport',
    name: '移動：白鬚神社 → 堅田店',
    timeStart: '12:20',
    timeEnd: '12:55',
    desc: '國道 161 號線',
    status: 'active',
    expenses: [],
    plan: 'A',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：35m',
        transport_mode: 'car',
        primary_info: '農家レストラン だいきち 堅田店',
        secondary_info: '國道 161 號線往南',
      },
    },
  },
  {
    id: 4032,
    date: '08/08',
    type: 'food',
    name: '農家レストラン だいきち',
    timeStart: '12:55',
    timeEnd: '13:55',
    desc: '堅田店',
    status: 'active',
    expenses: [],
    plan: 'A',
    jp_name: '農家レストラン だいきち',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        primary_info: '農家レストラン だいきち 堅田店',
        location_keyword: '農家レストラン だいきち',
        stay_time: '1hr',
        one_line_tip: '在地近江牛料理',
      },
      details: {
        title: '近江牛美味時光',
        content: '品嚐使用當地新鮮食材烹製的近江牛料理，這是西岸的特色美食。',
      },
    },
  },
  {
    id: 4033,
    date: '08/08',
    type: 'sight',
    name: '購物補給：Al Plaza',
    timeStart: '13:55',
    timeEnd: '14:25',
    desc: '採買零食飲用水',
    status: 'active',
    expenses: [],
    plan: 'A',
    jp_name: 'アル・プラザ堅田',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: 'アル・プラザ堅田 (超市)',
        location_keyword: 'Al Plaza Katata',
        stay_time: '30m',
        one_line_tip: '採買花火大會飲用水/零食',
      },
      details: {
        title: '物資採買',
        content: '在大型超市進行物資補給，為傍晚的長時間待機做準備。',
      },
    },
  },
  {
    id: 4034,
    date: '08/08',
    type: 'transport',
    name: '移動：Al Plaza → 浮御堂',
    timeStart: '14:25',
    timeEnd: '14:35',
    desc: '市區短程',
    status: 'active',
    expenses: [],
    plan: 'A',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：10m',
        transport_mode: 'car',
        primary_info: '前往浮御堂',
      },
    },
  },
  {
    id: 4035,
    date: '08/08',
    type: 'sight',
    name: '浮御堂 (滿月寺)',
    timeStart: '14:35',
    timeEnd: '15:05',
    desc: '近江八景',
    status: 'active',
    expenses: [],
    plan: 'A',
    jp_name: '浮御堂',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        location_keyword: 'Ukimido',
        stay_time: '30m',
        photo_guide: '湖上建築',
      },
      details: {
        title: '近江八景：堅田落雁',
        content: '這座漂浮在琵琶湖上的小木屋，是著名的堅田落雁所在地。',
      },
    },
  },
  {
    id: 4036,
    date: '08/08',
    type: 'transport',
    name: '移動：浮御堂 → 西教寺',
    timeStart: '15:05',
    timeEnd: '15:20',
    desc: '上山路段',
    status: 'active',
    expenses: [],
    plan: 'A',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'car',
        primary_info: '上山路段，注意會車',
      },
    },
  },
  {
    id: 4037,
    date: '08/08',
    type: 'scouting',
    name: '任務：西教寺停車場',
    timeStart: '15:20',
    timeEnd: '15:50',
    desc: '花火拍攝點場勘',
    status: 'active',
    expenses: [],
    plan: 'A',
    jp_name: '西教寺参拝者専用駐車場',
    aiData: {
      category: 'scouting',
      theme: 'dark',
      summary: {
        location_keyword: '西教寺駐車場',
        stay_time: '30m',
        one_line_tip: '確認停車位及視野',
      },
      details: {
        title: '高角度場勘',
        content:
          '西教寺停車場是拍攝琵琶湖花火的制高點之一。場勘確保能避開電線和樹木。',
      },
    },
  },

  // --- B 路線 B (東岸場勘) ---
  {
    id: 4041,
    date: '08/08',
    type: 'transport',
    name: '移動：白鬚神社 → 草津',
    timeStart: '12:20',
    timeEnd: '13:40',
    desc: '國道 161 號線/琵琶湖大橋',
    status: 'active',
    expenses: [],
    plan: 'B',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr 20m',
        transport_mode: 'car',
        primary_info: '經由琵琶湖大橋 (收費)',
      },
    },
  },
  {
    id: 4042,
    date: '08/08',
    type: 'food',
    name: 'なごやか亭 草津木川店',
    timeStart: '13:40',
    timeEnd: '14:40',
    desc: '迴轉壽司',
    status: 'active',
    expenses: [],
    plan: 'B',
    jp_name: 'なごやか亭',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        primary_info: 'なごやか亭 (迴轉壽司)',
        location_keyword: 'Nagoyaka-tei Kusatsu',
        stay_time: '1hr',
        one_line_tip: '北海道直送食材',
      },
      details: {
        title: '豪華迴轉壽司',
        content:
          '這家壽司店以使用北海道直送的食材聞名。午餐時段人潮較多，建議提早到達。',
      },
    },
  },
  {
    id: 4043,
    date: '08/08',
    type: 'transport',
    name: '短程移動：壽司 → 麵包店',
    timeStart: '14:40',
    timeEnd: '15:05',
    desc: '市區短程',
    status: 'active',
    expenses: [],
    plan: 'B',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：25m',
        transport_mode: 'car',
        primary_info: '前往 Pain du Marché',
      },
    },
  },
  {
    id: 4044,
    date: '08/08',
    type: 'food',
    name: '購物：Pain du Marché',
    timeStart: '15:05',
    timeEnd: '15:25',
    desc: '人氣麵包店',
    status: 'active',
    expenses: [],
    plan: 'B',
    jp_name: 'Pain du Marché',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: 'Pain du Marché (人氣麵包店)',
        location_keyword: 'Pain du Marché',
        stay_time: '20m',
        one_line_tip: '買好晚餐和點心',
      },
      details: {
        title: '在地美食補給',
        content: '採買美味的歐式麵包，作為花火大會期間的晚餐或點心。',
      },
    },
  },
  {
    id: 4045,
    date: '08/08',
    type: 'transport',
    name: '短程移動：麵包店 → 超市',
    timeStart: '15:25',
    timeEnd: '15:35',
    desc: '市區短程',
    status: 'active',
    expenses: [],
    plan: 'B',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：10m',
        transport_mode: 'car',
        primary_info: '前往 Valor 超市',
      },
    },
  },
  {
    id: 4046,
    date: '08/08',
    type: 'sight',
    name: '補給：Valor 超市',
    timeStart: '15:35',
    timeEnd: '15:50',
    desc: '採購飲用水',
    status: 'active',
    expenses: [],
    plan: 'B',
    jp_name: 'スーパーマーケットバロー',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: 'Valor 超市 草津店',
        location_keyword: 'スーパーマーケットバロー 草津店',
        stay_time: '15m',
        one_line_tip: '飲用水、椅子補給',
      },
      details: {
        title: '最終物資準備',
        content: '採購飲用水和任何長時間等待所需的用品。',
      },
    },
  },
  {
    id: 4047,
    date: '08/08',
    type: 'transport',
    name: '短程移動：超市 → 湖岸',
    timeStart: '15:50',
    timeEnd: '16:05',
    desc: '前往湖岸綠地',
    status: 'active',
    expenses: [],
    plan: 'B',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'car',
        primary_info: '前往志那湖岸',
      },
    },
  },
  {
    id: 4048,
    date: '08/08',
    type: 'scouting',
    name: '任務：湖岸攝影點卡位',
    timeStart: '16:05',
    timeEnd: '16:20',
    desc: '志那 1/2/津田江',
    status: 'active',
    expenses: [],
    plan: 'B',
    jp_name: '湖岸緑地志那',
    aiData: {
      category: 'scouting',
      theme: 'dark',
      summary: {
        location_keyword: '湖岸緑地志那',
        stay_time: '15m',
        one_line_tip: '選擇低角度拍攝點',
      },
      details: {
        title: '近水場勘',
        content:
          '志那湖岸是花火大會期間著名的低角度攝影點，確保找到最佳的腳架位置。',
      },
    },
  },

  // --- 共同項目 (Scouting / Activity / Transport) ---
  {
    id: 405,
    date: '08/08',
    type: 'scouting',
    name: '待機：最終選定的攝影點',
    timeStart: '16:20',
    timeEnd: '19:30',
    desc: '卡位等待',
    status: 'active',
    expenses: [],
    jp_name: '琵琶湖花火攝影點',
    aiData: {
      category: 'scouting',
      theme: 'dark',
      summary: {
        location_keyword: 'Biwako',
        stay_time: '3hr 10m',
        one_line_tip: '長時間抗戰：享用熟食、檢查公廁',
        photo_guide: '等待日落',
      },
      details: {
        title: '攝影師的堅持',
        content: '長時間的等待是為了最好的光線和角度。',
      },
    },
  },
  {
    id: 406,
    date: '08/08',
    type: 'sight',
    name: '琵琶湖大花火大會',
    timeStart: '19:30',
    timeEnd: '20:30',
    desc: '湖面花火',
    status: 'active',
    expenses: [],
    jp_name: 'びわ湖大花火大会',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        location_keyword: 'Biwako',
        stay_time: '1hr',
        one_line_tip: '湖面反射',
        photo_guide: '廣角',
      },
      details: {
        title: '湖光水色',
        content: '花火與噴泉的共演，色彩倒映在湖面上。',
      },
    },
  },
  {
    id: 407,
    date: '08/08',
    type: 'transport',
    name: '撤收：返回飯店',
    timeStart: '20:30',
    timeEnd: '00:00',
    desc: '自駕',
    status: 'active',
    expenses: [],
    jp_name: '京都駅',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：3.5hr',
        transport_mode: 'car',
        primary_info: '返回京都',
        secondary_info: '預期大塞車',
      },
      details: {
        title: '回程塞車預警',
        content: '花火大會散場時車流會非常巨大，必須要有心理準備。',
      },
    },
  },

  // --- Day 5: 2026/08/09 (京都最終日：古典與美食) ---
  {
    id: 501,
    date: '08/09',
    type: 'sight',
    name: '後勤：整理退房',
    timeStart: '07:00',
    timeEnd: '07:30',
    desc: 'Check-out',
    status: 'active',
    expenses: [],
    jp_name: '京都八条口相鉄フレッサ',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '本日起點',
        primary_info: '京都八條口相鐵弗雷薩',
        location_keyword: 'Sotetsu Fresa Inn Kyoto-Hachijoguchi',
        stay_time: '30m',
        one_line_tip: '確認行李與隨身物品',
        tel: '+81-75-284-0203',
      },
      details: {
        title: '旅程的最後一天',
        content:
          '整理行李並辦理退房手續。這是本日行程的起點錨點，請確保沒有遺漏任何物品在房間內。',
      },
    },
  },
  {
    id: 502,
    date: '08/09',
    type: 'transport',
    name: '移動：飯店 ➡ 加油站',
    timeStart: '07:30',
    timeEnd: '07:35',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：5m',
        transport_mode: 'car',
        primary_info: '前往 ENEOS',
        secondary_info: '最後一段自駕',
      },
    },
  },
  {
    id: 503,
    date: '08/09',
    type: 'sight',
    name: '後勤：加油 (Regular)',
    timeStart: '07:35',
    timeEnd: '07:45',
    desc: '還車前補給',
    status: 'active',
    expenses: [],
    jp_name: 'ENEOS',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: 'ENEOS EneJet 九条SS',
        location_keyword: 'ENEOS EneJet Dr.Drive Kujo',
        stay_time: '10m',
        one_line_tip: '保留收據供查驗',
        tel: '+81-75-691-3226',
      },
      details: {
        title: '加油任務',
        content:
          '歸還租賃車前的必要任務。請加滿 Regular (紅色油槍) 並妥善保管收據。',
      },
    },
  },
  {
    id: 504,
    date: '08/09',
    type: 'transport',
    name: '移動：加油站 ➡ ORIX',
    timeStart: '07:45',
    timeEnd: '07:55',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：10m',
        transport_mode: 'car',
        primary_info: '前往還車點',
        secondary_info: '檢查車內遺留物',
      },
    },
  },
  {
    id: 505,
    date: '08/09',
    type: 'sight',
    name: '後勤：ORIX 還車',
    timeStart: '07:55',
    timeEnd: '08:25',
    desc: '新幹線口店',
    status: 'active',
    expenses: [],
    jp_name: 'オリックスレンタカー',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: 'ORIX 租車 新幹線口店',
        location_keyword: 'ORIX Rent-A-Car Kyoto Station',
        stay_time: '30m',
        one_line_tip: '交通模式轉換：自駕結束',
        tel: '+81-75-661-0543',
      },
      details: {
        title: '自駕模式結束',
        content:
          '完成車輛檢查與歸還手續。接下來將轉換為大眾交通工具模式，請準備好 IC 卡或零錢。',
      },
    },
  },
  {
    id: 506,
    date: '08/09',
    type: 'transport',
    name: '移動：ORIX ➡ 琉璃光院',
    timeStart: '08:25',
    timeEnd: '09:25',
    desc: '地鐵/巴士',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：60m',
        transport_mode: 'public',
        primary_info: '地鐵轉巴士 (八瀨方面)',
        secondary_info: '長距離移動',
      },
    },
  },
  {
    id: 507,
    date: '08/09',
    type: 'sight',
    name: '琉璃光院',
    timeStart: '09:25',
    timeEnd: '11:25',
    desc: '光影與倒影',
    status: 'active',
    expenses: [],
    jp_name: '瑠璃光院',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '八瀨 琉璃光院',
        location_keyword: 'Rurikoin',
        stay_time: '2hr',
        one_line_tip: '二樓書院桌面倒影',
        photo_guide: '利用桌面反射拍攝',
        tel: '+81-75-781-4001',
      },
      details: {
        title: '極致的鏡面美學',
        content:
          '琉璃光院以其二樓書院的黑漆桌面倒影聞名。窗外的楓葉（即使是夏天的青楓）倒映在桌面上，形成如夢似幻的綠色光影世界。建議低角度拍攝以獲得最佳反射效果。',
      },
    },
  },
  {
    id: 508,
    date: '08/09',
    type: 'transport',
    name: '移動：琉璃光院 ➡ 三十三間堂',
    timeStart: '11:25',
    timeEnd: '12:35',
    desc: '巴士/京阪電車',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：70m',
        transport_mode: 'public',
        primary_info: '出町柳轉乘京阪線',
        secondary_info: '七條站下車',
      },
    },
  },
  {
    id: 509,
    date: '08/09',
    type: 'sight',
    name: '三十三間堂',
    timeStart: '12:35',
    timeEnd: '13:35',
    desc: '千手觀音',
    status: 'active',
    expenses: [],
    jp_name: '三十三間堂',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '蓮華王院 三十三間堂',
        location_keyword: 'Sanjusangendo',
        stay_time: '1hr',
        one_line_tip: '捕捉長廊縱深感',
        photo_guide: '內部禁止攝影，拍外觀',
        tel: '+81-75-561-0467',
      },
      details: {
        title: '千尊觀音的視覺衝擊',
        content:
          '日本國寶級建築，供奉著 1001 尊千手觀音像。長達 120 公尺的木造大殿是日本之最。雖然堂內禁止攝影，但其視覺震撼力絕對值得親眼見證。攝影重點在於建築外觀的長廊縱深感。',
      },
    },
  },
  {
    id: 510,
    date: '08/09',
    type: 'transport',
    name: '移動：三十三間堂 ➡ 祇園',
    timeStart: '13:35',
    timeEnd: '14:05',
    desc: '巴士',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'public',
        primary_info: '市營巴士',
        secondary_info: '前往午餐點',
      },
    },
  },
  {
    id: 511,
    date: '08/09',
    type: 'food',
    name: '【主推】三嶋亭 (壽喜燒)',
    timeStart: '14:05',
    timeEnd: '15:15',
    desc: '頂級壽喜燒',
    status: 'active',
    expenses: [],
    jp_name: '三嶋亭',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '午餐方案 A',
        primary_info: '三嶋亭 本店/高島屋店',
        location_keyword: 'Mishima-tei',
        stay_time: '70m',
        one_line_tip: '記帳與定位錨點 A',
        tel: '+81-75-221-0003',
      },
      details: {
        title: '京都壽喜燒的頂點',
        content:
          '創業於明治時期的百年老店。使用頂級黑毛和牛，由仲居（服務生）親自在桌邊料理。糖與醬油在鐵鍋中焦糖化的香氣，搭配入口即化的牛肉，是極致的味覺享受。若選擇此方案，請忽略方案 B。',
      },
    },
  },
  {
    id: 512,
    date: '08/09',
    type: 'food',
    name: '【備選】麵屋 豬一 離れ',
    timeStart: '14:05',
    timeEnd: '15:15',
    desc: '米其林拉麵',
    status: 'active',
    expenses: [],
    jp_name: '麺屋 猪一 離れ',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '午餐方案 B',
        primary_info: '麵屋 豬一 離れ',
        location_keyword: 'Menya Inoichi Hanare',
        stay_time: '70m',
        one_line_tip: '記帳與定位錨點 B',
        tel: '+81-75-285-1059',
      },
      details: {
        title: '細膩優雅的魚介清湯',
        content:
          'Tabelog 3.7+ 高分名店。主打魚介系清湯醬油拉麵，湯頭清澈金黃，口味細膩高雅，賣相精緻。與濃郁的壽喜燒形成強烈對比。若不想花費太多時間或預算，這是極具吸引力的備選方案。',
      },
    },
  },
  {
    id: 513,
    date: '08/09',
    type: 'transport',
    name: '移動：午餐 ➡ 中村藤吉',
    timeStart: '15:15',
    timeEnd: '15:30',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'walk',
        primary_info: '前往祇園四條店',
        secondary_info: '徒步消化',
      },
    },
  },
  {
    id: 514,
    date: '08/09',
    type: 'food',
    name: '中村藤吉 (祇園四條店)',
    timeStart: '15:30',
    timeEnd: '17:00',
    desc: '抹茶甜點',
    status: 'active',
    expenses: [],
    jp_name: '中村藤吉本店 祇園四条店',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        primary_info: '中村藤吉 祇園四條店',
        location_keyword: 'Nakamura Tokichi Gion',
        stay_time: '1.5hr',
        one_line_tip: '必點生茶果凍',
        tel: '+81-75-744-1200',
      },
      details: {
        title: '宇治抹茶的代名詞',
        content:
          '在典雅的京町家建築中，享用正宗的宇治抹茶甜點。招牌的「生茶果凍 (Namacha Jelly)」口感滑嫩，抹茶香氣濃郁而不苦澀，是京都午後的最佳休憩點。',
      },
    },
  },
  {
    id: 515,
    date: '08/09',
    type: 'transport',
    name: '移動：祇園 ➡ 八坂塔',
    timeStart: '17:00',
    timeEnd: '17:45',
    desc: '散步',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：45m',
        transport_mode: 'walk',
        primary_info: '沿途經過花見小路',
        secondary_info: '慢慢散步',
      },
    },
  },
  {
    id: 516,
    date: '08/09',
    type: 'sight',
    name: '八坂塔 (二寧坂視角)',
    timeStart: '17:45',
    timeEnd: '18:45',
    desc: '黃昏攝影',
    status: 'active',
    expenses: [],
    jp_name: '法觀寺 (八坂塔)',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '法觀寺 (八坂塔)',
        location_keyword: 'Yasaka Pagoda',
        stay_time: '1hr',
        one_line_tip: '掌握黃昏柔光時刻',
        photo_guide: '二寧坂經典角度',
        tel: '+81-75-551-2417',
      },
      details: {
        title: '東山的黃昏地標',
        content:
          '京都最經典的攝影角度之一。在黃昏時刻，夕陽的餘暉灑在五重塔和古老的木造建築上，充滿了濃厚的古都風情。建議在二寧坂尋找最佳構圖，避開過多的人潮。',
      },
    },
  },
  {
    id: 517,
    date: '08/09',
    type: 'transport',
    name: '移動：八坂塔 ➡ 晚餐',
    timeStart: '18:45',
    timeEnd: '19:00',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'walk',
        primary_info: '返回祇園方向',
        secondary_info: '下坡路段',
      },
    },
  },
  {
    id: 518,
    date: '08/09',
    type: 'food',
    name: '晚餐：祇園周邊',
    timeStart: '19:00',
    timeEnd: '20:00',
    desc: '正式晚餐',
    status: 'active',
    expenses: [],
    jp_name: '祇園',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        primary_info: '祇園餐廳',
        location_keyword: 'Gion Kyoto',
        stay_time: '1hr',
        one_line_tip: '選擇居酒屋或京料理',
        tel: 'N/A',
      },
      details: {
        title: '祇園的夜間饗宴',
        content:
          '在熱鬧的祇園地區享用晚餐。這裡匯集了從高級懷石料理到大眾居酒屋的各種選擇，可以根據當下的心情和體力決定。',
      },
    },
  },
  {
    id: 519,
    date: '08/09',
    type: 'transport',
    name: '移動：祇園 ➡ 先斗町',
    timeStart: '20:00',
    timeEnd: '20:15',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'walk',
        primary_info: '跨過四條大橋',
        secondary_info: '前往鴨川旁',
      },
    },
  },
  {
    id: 520,
    date: '08/09',
    type: 'sight',
    name: '先斗町 (窄巷燈籠)',
    timeStart: '20:15',
    timeEnd: '21:15',
    desc: '夜景攝影',
    status: 'active',
    expenses: [],
    jp_name: '先斗町',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '先斗町通',
        location_keyword: 'Pontocho',
        stay_time: '1hr',
        one_line_tip: '長焦壓縮窄巷感',
        photo_guide: '燈籠與石板路',
        tel: 'N/A',
      },
      details: {
        title: '花街的夜色',
        content:
          '京都五花街之一。狹窄的石板路兩旁掛滿了千鳥圖案的燈籠，充滿了神秘與傳統的氛圍。使用長焦鏡頭可以壓縮空間感，拍出燈籠綿延不絕的效果。',
      },
    },
  },
  {
    id: 521,
    date: '08/09',
    type: 'transport',
    name: '移動：先斗町 ➡ 飯店',
    timeStart: '21:15',
    timeEnd: '21:45',
    desc: '地鐵/步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'public',
        primary_info: '返回京都站',
        secondary_info: '結束美好的一天',
      },
    },
  },
  {
    id: 522,
    date: '08/09',
    type: 'sight',
    name: '住宿：相鐵弗雷薩',
    timeStart: '21:45',
    timeEnd: '22:15',
    desc: '休息',
    status: 'active',
    expenses: [],
    jp_name: '京都八条口相鉄フレッサ',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '本日終點',
        primary_info: '京都八條口相鐵弗雷薩',
        location_keyword: 'Sotetsu Fresa Inn Kyoto-Hachijoguchi',
        stay_time: 'Overnight',
        one_line_tip: '領取寄放行李',
        tel: '+81-75-284-0203',
      },
      details: {
        title: '旅程的終點',
        content:
          '回到飯店領取早上寄放的行李。整理照片，回味今天從琉璃光院的綠意到先斗町的燈火，完美的京都一日遊。',
      },
    },
  },

  // --- Day 6: 2026/08/10 (工藝之里：越前和紙與刀具) ---
  {
    id: 600,
    date: '08/10',
    type: 'sight',
    name: '京都站 (始發)',
    timeStart: '07:00',
    timeEnd: '07:05',
    desc: '特急雷鳥號',
    status: 'active',
    expenses: [],
    jp_name: '京都駅',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '移動日開始',
        primary_info: '京都站 0 號月台',
        location_keyword: 'Kyoto Station',
        stay_time: '5m',
        one_line_tip: '搭乘 Thunderbird 特急',
        tel: '+81-570-00-2486',
      },
      details: {
        title: '往北陸的序章',
        content:
          '早安，京都。在晨曦尚未完全喚醒古都之時，我們將踏上前往北陸的旅程。前往 0 號月台，那裡停靠著將帶我們穿越湖西線的特急 Thunderbird（雷鳥號）。這不僅僅是一段移動，更是從關西的優雅轉換到北陸職人硬派美學的過渡儀式。隨著列車啟動，請留意右側車窗，琵琶湖的晨色將是送給旅人的第一份禮物。',
        history:
          '雷鳥號列車名稱源自立山連峰的神鳥「雷鳥」，象徵著連結關西與北陸的快速與優雅，自國鐵時代以來便是北陸的大動脈。',
        photographer_advice:
          '若天氣晴朗，列車行駛於湖西線高架路段時，是拍攝琵琶湖晨光的絕佳時機。建議準備好相機，隨時捕捉湖面波光。',
        tour_guide_advice:
          '建議在上車前於京都站購買「志津屋 (SIZUYA)」的招牌炸牛排三明治 (Karnet)，那種簡單卻深邃的滋味是京都人共同的早餐記憶。',
        must_list: [
          '必吃：志津屋炸牛排三明治',
          '必買：伊右衛門京都限定茶',
          '重點：確認0號月台',
        ],
      },
    },
  },
  {
    id: 601,
    date: '08/10',
    type: 'transport',
    name: '移動：京都 ➡ 敦賀',
    timeStart: '07:05',
    timeEnd: '07:54',
    desc: '特急 Thunderbird',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：50m',
        transport_mode: 'public',
        primary_info: 'Thunderbird 3號',
        secondary_info: '前往敦賀轉乘',
      },
    },
  },
  {
    id: 602,
    date: '08/10',
    type: 'sight',
    name: '敦賀站 (轉乘)',
    timeStart: '07:54',
    timeEnd: '08:08',
    desc: '轉乘新幹線',
    status: 'active',
    expenses: [],
    jp_name: '敦賀駅',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '轉乘樞紐',
        primary_info: '敦賀站轉乘',
        location_keyword: 'Tsuruga Station',
        stay_time: '14m',
        one_line_tip: '跟隨地標換乘新幹線',
        tel: '+81-570-00-2486',
      },
      details: {
        title: '北陸新門戶',
        content:
          '敦賀站，這座嶄新的巨大車站，標誌著北陸新幹線延伸段的開通。高挑的木質天花板設計靈感來自北前船的船帆，象徵著這裡自古以來作為港口城市的繁榮。轉乘過程雖然只有短短十多分鐘，但這是一次從「傳統特急」到「現代新幹線」的時空跳躍。',
        photographer_advice:
          '車站內的木造結構與現代玻璃帷幕形成強烈對比，利用廣角鏡頭拍攝天花板的線條，能展現出建築的幾何美感。',
        tour_guide_advice:
          '轉乘動線設計得非常直觀，地板上有巨大的顏色引導線。請務必跟隨「新幹線」的指示，從下層特急月台迅速移動至上層。',
        must_list: [
          '重點：跟隨地板顏色指示',
          '重點：轉乘不需出站',
          '必看：車站木質穹頂',
        ],
      },
    },
  },
  {
    id: 603,
    date: '08/10',
    type: 'transport',
    name: '移動：敦賀 ➡ 福井',
    timeStart: '08:08',
    timeEnd: '08:45',
    desc: '北陸新幹線',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：37m',
        transport_mode: 'public',
        primary_info: 'Tsurugi 12號',
        secondary_info: '前往福井',
      },
    },
  },
  {
    id: 604,
    date: '08/10',
    type: 'sight',
    name: '福井站 (恐龍廣場)',
    timeStart: '08:45',
    timeEnd: '08:50',
    desc: '西口恐龍像',
    status: 'active',
    expenses: [],
    jp_name: '福井駅',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '抵達福井',
        primary_info: '福井站西口',
        location_keyword: 'Fukui Station',
        stay_time: '5m',
        one_line_tip: '西口有會動的恐龍像',
        tel: '+81-776-20-5367',
      },
      details: {
        title: '侏羅紀世界的入口',
        content:
          '歡迎來到恐龍王國！一踏出福井站西口，巨大的暴龍機械模型正在對你咆哮，牆面上還有立體的恐龍破牆而出。這不是主題樂園，而是福井縣對其挖掘出大量恐龍化石的驕傲展示。整個廣場充滿了超現實的趣味感，彷彿時空錯置，讓人瞬間忘記旅途的疲憊。',
        photographer_advice:
          '使用超廣角鏡頭，採取極低角度仰拍暴龍，並將車站現代化的玻璃帷幕納入背景，可以創造出「恐龍入侵現代都市」的視覺衝擊感。',
        tour_guide_advice:
          '別忘了坐在「恐龍博士長椅」上與穿著白袍的恐龍博士合照，這是福井最經典的打卡方式。',
        must_list: ['必拍：會動的暴龍', '必拍：恐龍博士長椅', '必看：車站壁畫'],
      },
    },
  },
  {
    id: 605,
    date: '08/10',
    type: 'transport',
    name: '移動：車站 ➡ 飯店',
    timeStart: '08:50',
    timeEnd: '09:00',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：10m',
        transport_mode: 'walk',
        primary_info: '前往東橫INN',
        secondary_info: '寄放行李',
      },
    },
  },
  {
    id: 606,
    date: '08/10',
    type: 'sight',
    name: '後勤：飯店寄放行李',
    timeStart: '09:00',
    timeEnd: '09:15',
    desc: '東橫INN 福井站前',
    status: 'active',
    expenses: [],
    jp_name: '東横INN福井駅前',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: '東橫INN 福井站前',
        location_keyword: 'Toyoko Inn Fukui Ekimae',
        stay_time: '15m',
        one_line_tip: '僅寄放行李',
        tel: '+81-776-26-1045',
      },
      details: {
        title: '輕裝上陣的智慧',
        content:
          '在展開越前工藝的深度探索之前，先將沈重的行李卸下是明智之舉。東橫INN作為我們今晚的基地，提供了便捷的寄放服務。利用這短短的十多分鐘，調整隨身裝備，只帶上相機、錢包與對工藝的好奇心，讓接下來的自駕旅程更加輕盈自在。',
        tour_guide_advice:
          '寄放行李時，建議順便詢問櫃台關於今晚停車的安排（是否需要預約機械車位？），這能省去晚上回來時的溝通時間。',
        must_list: ['重點：寄放行李', '重點：確認停車位', '必備：護照隨身'],
      },
    },
  },
  {
    id: 607,
    date: '08/10',
    type: 'transport',
    name: '移動：飯店 ➡ Orix',
    timeStart: '09:15',
    timeEnd: '09:20',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：5m',
        transport_mode: 'walk',
        primary_info: '前往租車店',
        secondary_info: '車站東口方向',
      },
    },
  },
  {
    id: 608,
    date: '08/10',
    type: 'sight',
    name: '租車：Orix 取車',
    timeStart: '09:20',
    timeEnd: '09:30',
    desc: '福井站前店',
    status: 'active',
    expenses: [],
    jp_name: 'オリックスレンタカー',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: 'Orix 福井駅前店',
        location_keyword: 'Orix Rent-A-Car Fukui',
        stay_time: '10m',
        one_line_tip: '檢查車況、設定導航',
        tel: '+81-776-24-0019',
      },
      details: {
        title: '掌握方向盤的自由',
        content:
          '越前市的工藝聚落分散，自駕是探索這片土地的最佳方式。在 Orix 辦理取車手續時，請將心態切換為「探險模式」。今天我們將深入那些大眾交通難以觸及的職人秘境。確認車輛狀況後，輸入第一站 MapCode，隨著引擎發動，越前職人之旅正式啟程。',
        tour_guide_advice:
          '務必確認 ETC 卡是否已正確插入主機。設定導航時，建議將音量調大，因為日本導航在路口前的提示通常較為頻繁。',
        must_list: [
          '重點：檢查外觀刮痕',
          '必備：ETC卡',
          '重點：設定第一站導航',
        ],
      },
    },
  },
  {
    id: 609,
    date: '08/10',
    type: 'transport',
    name: '移動：福井 ➡ 岡太神社',
    timeStart: '09:30',
    timeEnd: '10:15',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：45m',
        transport_mode: 'car',
        primary_info: '前往越前市',
        secondary_info: '約 25 公里',
      },
    },
  },
  {
    id: 610,
    date: '08/10',
    type: 'sight',
    name: '岡太神社・大瀧神社',
    timeStart: '10:15',
    timeEnd: '11:15',
    desc: '紙之神',
    status: 'active',
    expenses: [],
    jp_name: '岡太神社・大瀧神社',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '岡太神社・大瀧神社',
        location_keyword: 'Okamoto Shrine',
        stay_time: '1hr',
        one_line_tip: '拍攝複雜的屋頂結構',
        photo_guide: '使用廣角與長焦特寫屋頂',
        tel: '+81-778-42-1151',
      },
      details: {
        title: '獻給紙神的建築奇蹟',
        content:
          '隱身在深山巨木之中的岡太神社，是全日本唯一供奉「紙神」川上御前的地方。當你第一眼看到下宮的拜殿時，絕對會被那層層堆疊、如波浪般翻湧的檜皮葺屋頂所震懾。這不僅是建築，更是越前和紙職人對神明最崇高的敬意展現。複雜的斗拱與精細的獅子、龍木雕，在寂靜的森林中訴說著千年的信仰。',
        history:
          '傳說1500年前，一位美麗的女神在岡太川上游傳授了造紙技術給村民，從此越前和紙便聞名遐邇。這座神社便是為了感念那位女神而建。',
        photographer_advice:
          '屋頂的曲線是拍攝靈魂。建議使用長焦鏡頭（70-200mm）進行「壓縮」，特寫那繁複的屋頂結構與木雕細節。同時，利用廣角鏡頭帶入周圍參天的古杉，能展現出神域的空靈與莊嚴。',
        tour_guide_advice:
          '這裡遊客稀少，極度寧靜。參拜後，請務必繞到本殿後方，欣賞那令人驚嘆的建築懸山結構。',
        must_list: ['必看：檜皮葺波浪屋頂', '必看：本殿木雕', '體驗：森林浴'],
      },
    },
  },
  {
    id: 611,
    date: '08/10',
    type: 'transport',
    name: '移動：神社 ➡ 和紙之里',
    timeStart: '11:15',
    timeEnd: '11:20',
    desc: '短程移動',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：5m',
        transport_mode: 'car',
        primary_info: '前往越前和紙之里',
        secondary_info: '極短車程',
      },
    },
  },
  {
    id: 612,
    date: '08/10',
    type: 'sight',
    name: '越前和紙之里',
    timeStart: '11:20',
    timeEnd: '12:30',
    desc: '傳統工藝',
    status: 'active',
    expenses: [],
    jp_name: '越前和紙の里',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '越前和紙之里 (卯立工藝館)',
        location_keyword: 'Echizen Washi Village',
        stay_time: '1hr 10m',
        one_line_tip: '體驗手抄和紙',
        photo_guide: '拍攝職人手部動作',
        tel: '+81-778-43-7800',
      },
      details: {
        title: '指尖上的千年溫度',
        content:
          '走進卯立工藝館（Udatsu Paper & Craft Museum），空氣中彌漫著紙漿與水的獨特氣味。這裡保存了傳統的越前和紙製作工法。看著職人有節奏地在水中搖動竹簾（流し漉き），那專注的神情與水流的聲音，彷彿時間靜止。越前和紙以其強韌與優美著稱，甚至被用於日本的紙幣製作。親手觸摸那些剛做好的和紙，你會感受到機器無法取代的溫度。',
        photographer_advice:
          '職人抄紙的瞬間是絕佳的攝影題材。將焦點對準職人的手部與飛濺的水珠，使用稍快的快門凝結水流的動態感，或利用窗邊的自然光拍攝透光的和紙紋理。',
        tour_guide_advice:
          '強烈推薦參加「手抄和紙體驗」（約1500日圓）。只要20分鐘，你就能親手製作出帶有押花或金箔的專屬和紙明信片，這是此行最珍貴的紀念品。',
        must_list: [
          '體驗：手抄和紙DIY',
          '必買：和紙信紙組',
          '必看：職人流漉技法',
        ],
      },
    },
  },
  {
    id: 613,
    date: '08/10',
    type: 'transport',
    name: '移動：和紙之里 ➡ 生蕎庵',
    timeStart: '12:30',
    timeEnd: '12:50',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：20m',
        transport_mode: 'car',
        primary_info: '前往午餐地點',
        secondary_info: '越前市區',
      },
    },
  },
  {
    id: 614,
    date: '08/10',
    type: 'food',
    name: '生蕎庵 (Kibuan)',
    timeStart: '12:50',
    timeEnd: '14:00',
    desc: '越前蘿蔔泥蕎麥麵',
    status: 'active',
    expenses: [],
    jp_name: '生蕎庵',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        primary_info: 'Sobadokoro Kibuan',
        location_keyword: 'Sobadokoro Kibuan',
        stay_time: '1hr 10m',
        one_line_tip: '必點越前蘿蔔泥蕎麥麵',
        tel: '+81-778-42-0253',
      },
      details: {
        title: '辛辣與清香的直球對決',
        content:
          '來到福井，如果沒吃過「越前蘿蔔泥蕎麥麵 (Echizen Oroshi Soba)」，就不算來過。「生蕎庵」是當地人私藏的名店，這裡的蕎麥麵使用石臼研磨的福井縣產蕎麥粉，香氣濃郁逼人。與一般沾麵不同，這裡是將辛辣的蘿蔔泥高湯直接淋在冷麵上。第一口，蘿蔔的辛辣直衝腦門，緊接著是蕎麥的甘甜與柴魚的鮮香，那種爽快感在炎炎夏日簡直是救贖。',
        tour_guide_advice:
          '除了招牌的蘿蔔泥蕎麥麵，建議加點一份「炸天婦羅」。這裡的天婦羅麵衣輕薄酥脆，沾著蘿蔔泥高湯一起吃，油膩感全消，是完美的味覺平衡。',
        must_list: [
          '必吃：蘿蔔泥蕎麥麵',
          '必吃：炸天婦羅',
          '重點：最後喝蕎麥湯',
        ],
      },
    },
  },
  {
    id: 615,
    date: '08/10',
    type: 'transport',
    name: '移動：餐廳 ➡ 刀具村',
    timeStart: '14:00',
    timeEnd: '14:20',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：20m',
        transport_mode: 'car',
        primary_info: '前往武生刀具村',
        secondary_info: '工業區',
      },
    },
  },
  {
    id: 616,
    date: '08/10',
    type: 'sight',
    name: '武生刀具村',
    timeStart: '14:20',
    timeEnd: '15:20',
    desc: '越前打刃物',
    status: 'active',
    expenses: [],
    jp_name: 'タケフナイフビレッジ',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: 'Takefu Knife Village',
        location_keyword: 'Takefu Knife Village',
        stay_time: '1hr',
        one_line_tip: '參觀共同工房',
        photo_guide: '火花與金屬質感',
        tel: '+81-778-27-7120',
      },
      details: {
        title: '火花中鍛造的鋼鐵靈魂',
        content:
          '遠遠就能看到這座造型前衛的建築，武生刀具村是集結了多家「越前打刃物」職人的共同工房。這裡沒有玻璃櫥窗的隔閡，你可以站在二樓的迴廊，直接俯瞰下方火花四濺的鍛造現場。機械鎚的撞擊聲、磨刀的滋滋聲、以及空氣中瀰漫的鐵鏽味，構成了最真實的工業交響曲。這裡傳承了700年的鍛造技術，每一把刀都是職人汗水的結晶。',
        history:
          '越前打刃物的歷史可追溯至1337年，當時京都的刀匠千代鶴國安為了尋找適合鍛刀的水而來到此地，將製刀技術傳授給當地農民。',
        photographer_advice:
          '這裡的光線通常充滿戲劇性。將鏡頭對準正在打鐵的職人，使用較慢的快門（如 1/15秒）可以拍出火花飛濺的軌跡線條，展現動感；或使用高速快門凝結火花，展現力量感。黑白模式也非常適合這裡的氛圍。',
        must_list: [
          '必看：職人鍛造現場',
          '必買：職人手作廚刀',
          '必看：刀具博物館',
        ],
      },
    },
  },
  {
    id: 617,
    date: '08/10',
    type: 'transport',
    name: '移動：刀具村 ➡ 龍泉刃物',
    timeStart: '15:20',
    timeEnd: '15:23',
    desc: '超短程',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：3m',
        transport_mode: 'car',
        primary_info: '就在附近',
        secondary_info: '車程 1 公里',
      },
    },
  },
  {
    id: 618,
    date: '08/10',
    type: 'sight',
    name: '龍泉刃物 (Ryusen)',
    timeStart: '15:23',
    timeEnd: '16:23',
    desc: '頂級牛排刀',
    status: 'active',
    expenses: [],
    jp_name: '龍泉刃物',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '龍泉刃物 直營店',
        location_keyword: 'Ryusen Hamono',
        stay_time: '1hr',
        one_line_tip: '欣賞大馬士革鋼紋路',
        tel: '+81-778-23-3552',
      },
      details: {
        title: '餐桌上的藝術品',
        content:
          '如果說武生刀具村是粗獷的鍛造現場，那麼龍泉刃物就是精緻的藝術殿堂。這裡生產的牛排刀，是法國米其林三星餐廳的指定餐具，甚至需要排隊數年才能入手。走進直營店，你會被刀刃上那如流水般的大馬士革鋼紋路（龍泉輪）所迷住。那不僅是鋒利的工具，更是結合了實用與美學的工藝極致。握在手中，那種完美的配重與手感，會讓人感動。',
        photographer_advice:
          '這裏適合進行「微距攝影」。將鏡頭貼近刀刃，捕捉大馬士革鋼那獨特的層疊紋理。店內的燈光設計精良，利用反光可以拍出金屬的高級質感。',
        tour_guide_advice:
          '店內有時會提供試切體驗（視當日狀況），請務必嘗試切切看，你會驚訝於那種「毫無阻力」的切斷感。這裡的拆信刀或指甲剪是相對好入手的入門精品。',
        must_list: [
          '必看：大馬士革鋼紋',
          '必買：SK01 牛排刀',
          '必買：精緻拆信刀',
        ],
      },
    },
  },
  {
    id: 619,
    date: '08/10',
    type: 'transport',
    name: '移動：越前 ➡ 福井市',
    timeStart: '16:23',
    timeEnd: '17:20',
    desc: '自駕返回',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：55m',
        transport_mode: 'car',
        primary_info: '返回福井市區',
        secondary_info: '傍晚車流可能較多',
      },
    },
  },
  {
    id: 620,
    date: '08/10',
    type: 'sight',
    name: '後勤：車輛停放',
    timeStart: '17:20',
    timeEnd: '17:30',
    desc: '停回飯店/停車場',
    status: 'active',
    expenses: [],
    jp_name: '駐車場',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: '飯店/周邊停車場',
        location_keyword: 'Fukui Station Parking',
        stay_time: '10m',
        one_line_tip: '停好車，步行去晚餐',
        tel: 'N/A',
      },
      details: {
        title: '暫別方向盤',
        content:
          '結束了充實的越前工藝之旅，我們回到了福井市區。現在是時候讓愛車休息了。請將車輛停放在飯店停車場或周邊的收費停車場。接下來的行程——養浩館的靜謐與秋吉的熱鬧，都在步行可達的範圍內。放下鑰匙，準備用雙腳和味蕾去感受福井的夜晚吧。',
        tour_guide_advice:
          '停好車後，請務必帶上相機包，並確認車門已鎖好。把停車券收好，有些飯店櫃檯需要過卡。',
        must_list: [
          '重點：妥善停車',
          '重點：攜帶隨身貴重物',
          '重點：停車券保管',
        ],
      },
    },
  },
  {
    id: 621,
    date: '08/10',
    type: 'transport',
    name: '移動：停車場 ➡ 養浩館',
    timeStart: '17:30',
    timeEnd: '17:35',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：5m',
        transport_mode: 'walk',
        primary_info: '前往養浩館庭園',
        secondary_info: '步行前往',
      },
    },
  },
  {
    id: 622,
    date: '08/10',
    type: 'sight',
    name: '養浩館庭園',
    timeStart: '17:35',
    timeEnd: '18:35',
    desc: '大名庭園',
    status: 'active',
    expenses: [],
    jp_name: '養浩館庭園',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '養浩館庭園',
        location_keyword: 'Yokokan Garden',
        stay_time: '1hr',
        one_line_tip: '拍攝黃昏池面倒影',
        photo_guide: '從屋內往外拍',
        tel: '+81-776-21-0489',
      },
      details: {
        title: '漂浮在水上的江戶夢境',
        content:
          '養浩館庭園是前福井藩主松平家的別邸，它最大的特色在於建築物彷彿直接「漂浮」在巨大的池塘之上。與京都庭園的封閉感不同，這裡充滿了開放與寬闊的氣息。脫下鞋子，走進數寄屋造的建築內部，坐在榻榻米上望向庭園，水面幾乎與視線齊平。黃昏時分，夕陽的餘暉灑在水面上，庭園的倒影與真實世界交融，寧靜得讓人屏息。',
        history:
          '這裡曾是藩主的休養所，被美國著名的庭園雜誌連續多年評選為日本庭園的前幾名，其實力不輸給兼六園，卻擁有難得的清幽。',
        photographer_advice:
          'Blue Hour（日落後的藍調時刻）是這裡的魔幻時刻。建議從建築物內部往外拍攝，利用窗框作為天然的畫框，將亮燈的石燈籠與水面倒影一同納入構圖，可以拍出極具禪意的對稱畫面。',
        must_list: [
          '必拍：御月見之間倒影',
          '體驗：緣側靜坐',
          '必看：數寄屋建築',
        ],
      },
    },
  },
  {
    id: 623,
    date: '08/10',
    type: 'transport',
    name: '移動：養浩館 ➡ 秋吉',
    timeStart: '18:35',
    timeEnd: '18:45',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：10m',
        transport_mode: 'walk',
        primary_info: '前往秋吉串燒',
        secondary_info: '步行前往',
      },
    },
  },
  {
    id: 624,
    date: '08/10',
    type: 'food',
    name: '秋吉 (福井駅前店)',
    timeStart: '18:45',
    timeEnd: '20:15',
    desc: '福井靈魂美食',
    status: 'active',
    expenses: [],
    jp_name: 'やきとりの名門 秋吉',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        primary_info: '秋吉 福井駅前店',
        location_keyword: 'Yakitori no Meimon Akiyoshi',
        stay_time: '1.5hr',
        one_line_tip: '必點純雞 (Junkei)',
        tel: '+81-776-21-3572',
      },
      details: {
        title: '社長，歡迎回來！',
        content:
          '在福井，如果你問當地人要去哪裡聚餐，十個人有九個會說「秋吉」。一進店門，店員精神抖擻地喊著「社長，歡迎回來！」，瞬間就會被這股熱情的氣氛感染。這裡的特色是串燒非常小巧，且以「5串」為單位點餐。大家圍坐在櫃檯前，看著師傅在炭火上熟練地翻轉雞肉，將烤好的串燒放在你面前的保溫鐵板上。這不僅是晚餐，更是融入福井庶民文化的最佳體驗。',
        tour_guide_advice:
          '必點招牌是「純雞 (Junkei)」，使用的是嚴選的母雞肉，口感極具嚼勁且肉汁豐富，是其他地方吃不到的美味。別忘了點特製的蒜味沾醬，搭配生啤酒簡直絕配。',
        must_list: [
          '必吃：純雞 (5串)',
          '必吃：雞皮 (Shiro)',
          '必吃：炸串 (Kushi-katsu)',
        ],
      },
    },
  },
  {
    id: 625,
    date: '08/10',
    type: 'transport',
    name: '移動：秋吉 ➡ 飯店',
    timeStart: '20:15',
    timeEnd: '20:20',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：5m',
        transport_mode: 'walk',
        primary_info: '返回東橫INN',
        secondary_info: '步行回飯店',
      },
    },
  },
  {
    id: 626,
    date: '08/10',
    type: 'sight',
    name: '住宿：東橫INN',
    timeStart: '20:20',
    timeEnd: '23:59',
    desc: '休息',
    status: 'active',
    expenses: [],
    jp_name: '東横INN福井駅前',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        primary_info: '東橫INN 福井站前',
        location_keyword: 'Toyoko Inn Fukui Ekimae',
        stay_time: 'Overnight',
        one_line_tip: '領取行李、休息',
        tel: '+81-776-26-1045',
      },
      details: {
        title: '明日的特種兵整備',
        content:
          '帶著滿身的烤肉香氣與微醺的滿足感回到飯店。領取早上寄放的行李，辦理入住。今晚的休息至關重要，因為明天凌晨四點我們就要出發去追逐天空之城的日出。請務必將所有相機電池充飽電，整理好今天的和紙與刀具戰利品，並設定好鬧鐘。福井的夜，晚安。',
        must_list: [
          '重點：相機充電',
          '重點：設定04:00鬧鐘',
          '重點：整理戰利品',
        ],
      },
    },
  },

  // --- Day 7: 2026/08/11 (越前大野晨光與三國花火) ---
  {
    id: 700,
    date: '08/11',
    type: 'sight',
    name: '起點：凌晨出發',
    timeStart: '04:00',
    timeEnd: '04:00',
    desc: '早起出發',
    status: 'active',
    expenses: [],
    jp_name: '東横INN福井駅前',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '特種兵行程開始',
        primary_info: '東橫INN 福井站前',
        location_keyword: 'Toyoko Inn Fukui Ekimae',
        stay_time: '0m',
        one_line_tip: '攜帶手電筒與防寒衣物',
        tel: '+81-776-26-1045',
      },
      details: {
        title: '星夜中的出征',
        content:
          '凌晨 04:00，城市還在沉睡，我們已經整裝待發。這是一場與太陽的賽跑。今天的目標是越前大野城，被稱為「北陸的天空之城」。雖然身體可能還殘留著睡意，但想到即將見證的景色，腎上腺素已經開始分泌。請務必再次檢查：手電筒帶了嗎？防寒衣物穿了嗎？相機記憶卡清空了嗎？出發吧，去追逐第一道晨光。',
        must_list: ['必備：手電筒/頭燈', '必備：防寒薄外套', '重點：準時出發'],
      },
    },
  },
  {
    id: 701,
    date: '08/11',
    type: 'transport',
    name: '移動：飯店 ➡ 越前大野',
    timeStart: '04:00',
    timeEnd: '04:50',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：50m',
        transport_mode: 'car',
        primary_info: '導航：天空之城展望台停車場',
        secondary_info: '夜間山路小心',
      },
    },
  },
  {
    id: 702,
    date: '08/11',
    type: 'transport',
    name: '移動：登山 ➡ 展望台',
    timeStart: '04:50',
    timeEnd: '05:10',
    desc: '徒步登山',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：20m',
        transport_mode: 'walk',
        primary_info: '徒步上山',
        secondary_info: '需手電筒',
      },
      details: {
        title: '黎明前的攀登',
        content:
          '停好車後，迎接我們的是一段約 20 分鐘的登山步道。四周漆黑一片，只有腳下的手電筒光圈指引方向。空氣冷冽而清新，樹林間偶爾傳來鳥鳴。這是一段與自己對話的時間，隨著高度攀升，視野逐漸開闊，遠方大野市的街燈如同地上的星河，預告著我們即將抵達最佳觀測點。',
      },
    },
  },
  {
    id: 703,
    date: '08/11',
    type: 'scouting',
    name: '攝影：越前大野城',
    timeStart: '05:10',
    timeEnd: '06:30',
    desc: '天空之城',
    status: 'active',
    expenses: [],
    jp_name: '越前大野城',
    aiData: {
      category: 'scouting',
      theme: 'dark',
      summary: {
        primary_info: '天空之城展望台',
        location_keyword: 'Echizen Ono Castle Observation Deck',
        stay_time: '1hr 20m',
        one_line_tip: '夏季雲海機率低，主攻晨光',
        photo_guide: '長焦特寫城堡',
        tel: '+81-779-66-0234',
      },
      details: {
        title: '漂浮於晨光中的幻影',
        content:
          '站在戌山城址的展望台上，屏息以待。雖然 8 月盛夏要見到典型的「雲海」需要極佳的運氣（通常發生在秋冬溫差大時），但此刻的景色依然令人動容。遠方的龜山頂上，越前大野城孤傲地矗立著。當第一道曙光翻越山稜，金色的光線瞬間點亮天守閣，那一刻，城堡彷彿漂浮在光與薄霧交織的虛幻之海中。這是攝影師夢寐以求的「Magic Hour」。',
        history:
          '這座城堡由織田信長的部將金森長近於 1576 年建造，其城下町棋盤狀的佈局至今仍保留著「小京都」的風貌。',
        photographer_advice:
          '長焦鏡頭（200mm-400mm）是這裡的決勝關鍵。利用長焦壓縮空間，將背景的山脈與前景的城堡拉近，營造出孤絕的氣勢。若沒有雲海，則專注於捕捉晨光在城堡牆面上的色溫變化。',
        must_list: ['必備：長焦鏡頭', '必備：穩固腳架', '體驗：晨間咖啡'],
      },
    },
  },
  {
    id: 704,
    date: '08/11',
    type: 'transport',
    name: '移動：展望台 ➡ 飯店',
    timeStart: '06:30',
    timeEnd: '07:30',
    desc: '自駕返回',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr',
        transport_mode: 'car',
        primary_info: '返回福井市區',
        secondary_info: '準備補眠',
      },
    },
  },
  {
    id: 705,
    date: '08/11',
    type: 'sight',
    name: '休息：飯店補眠',
    timeStart: '07:30',
    timeEnd: '11:00',
    desc: '盥洗與早餐',
    status: 'active',
    expenses: [],
    jp_name: '東横INN福井駅前',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '體力回充',
        primary_info: '東橫INN 福井站前',
        location_keyword: 'Toyoko Inn Fukui Ekimae',
        stay_time: '3.5hr',
        one_line_tip: '享用早餐、補眠',
        tel: '+81-776-26-1045',
      },
      details: {
        title: '戰略性休整',
        content:
          '結束了清晨的特種兵任務，現在我們回到了舒適的現代文明。這 3.5 小時的空檔不是浪費，而是為了下午更艱鉅的「花火大會」所做的戰略性儲備。享用飯店的熱騰騰早餐，洗去登山的汗水，拉上窗簾補個回籠覺。在長途旅行中，懂得「休息」的旅人才能走得更遠。',
        must_list: ['重點：洗熱水澡', '重點：手機充電', '重點：補眠'],
      },
    },
  },
  {
    id: 706,
    date: '08/11',
    type: 'transport',
    name: '移動：飯店 ➡ 歐洲軒',
    timeStart: '11:00',
    timeEnd: '11:10',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：10m',
        transport_mode: 'car',
        primary_info: '前往歐洲軒總本店',
        secondary_info: '市區短程',
      },
    },
  },
  {
    id: 707,
    date: '08/11',
    type: 'food',
    name: '午餐：歐洲軒 總本店',
    timeStart: '11:10',
    timeEnd: '12:30',
    desc: '醬汁豬排丼',
    status: 'active',
    expenses: [],
    jp_name: 'ヨーロッパ軒 総本店',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        primary_info: '歐洲軒 總本店',
        location_keyword: 'Europe-ken Sohonten',
        stay_time: '1hr 20m',
        one_line_tip: '內行吃法：不加蛋',
        tel: '+81-776-21-4681',
      },
      details: {
        title: '百年傳承的醬汁魔力',
        content:
          '來到福井，怎能不朝聖「歐洲軒」總本店？這裡是福井名物「醬汁豬排丼 (Sauce Katsudon)」的發源地。創業於1913年，其秘製的烏斯特醬汁是整碗飯的靈魂。與一般淋蛋液的豬排丼不同，這裡的豬排是薄切後沾裹細麵包粉油炸，再浸泡在酸甜的醬汁中，鋪在淋了醬的白飯上。簡單、粗暴，卻美味得讓人停不下來。',
        tour_guide_advice:
          '內行人的點法是「不加蛋」。雖然也有混合蛋液的選項，但最經典的吃法就是享受那酥脆麵衣吸滿醬汁後的獨特口感。店內常常大排長龍，建議一開店就進去。',
        must_list: [
          '必吃：醬汁豬排丼',
          '必吃：炸牡蠣(季節限定)',
          '必買：特製醬汁伴手禮',
        ],
      },
    },
  },
  {
    id: 708,
    date: '08/11',
    type: 'transport',
    name: '移動：福井 ➡ 東尋坊',
    timeStart: '12:30',
    timeEnd: '13:30',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr',
        transport_mode: 'car',
        primary_info: '前往東尋坊',
        secondary_info: '往海邊移動',
      },
    },
  },
  {
    id: 709,
    date: '08/11',
    type: 'sight',
    name: '東尋坊 (Tojinbo)',
    timeStart: '13:30',
    timeEnd: '16:30',
    desc: '柱狀節理斷崖',
    status: 'active',
    expenses: [],
    jp_name: '東尋坊',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '東尋坊',
        location_keyword: 'Tojinbo Cliffs',
        stay_time: '3hr',
        one_line_tip: '光線強烈，注意防曬',
        photo_guide: '使用CPL濾鏡消除反光',
        tel: '+81-776-82-5515',
      },
      details: {
        title: '被巨浪雕刻的幾何學',
        content:
          '站在東尋坊的懸崖邊，腳下是高達 25 公尺的峭壁，眼前是波濤洶湧的日本海。這裡擁有世界少見的大規模「輝石安山岩柱狀節理」，被列為國家天然紀念物。這些五角形或六角形的岩柱，彷彿是大自然用巨大的鑿子刻出來的幾何藝術品。午後的陽光強烈，海風帶著鹹味，海浪拍打岩壁的轟鳴聲震撼人心。',
        history:
          '傳說這裡曾有一位名為「東尋坊」的惡僧，因作惡多端被村民推下懸崖，從此這裡便波濤洶湧，因而得名。',
        photographer_advice:
          '下午 13:30-16:30 光線非常硬，海面反光強烈。強烈建議使用 CPL 偏光鏡，不僅能消除海面反光，還能讓藍天與岩石的對比更加鮮明。若想拍出壯闊感，建議搭乘觀光船從海面上仰拍。',
        tour_guide_advice:
          '夏天這裡非常炎熱。拍完照後，務必躲進商店街，買一支當地特色的「墨魚汁霜淇淋」消暑，黑色的外觀非常吸睛！',
        must_list: ['必拍：大池斷崖', '必備：CPL濾鏡', '必吃：墨魚汁霜淇淋'],
      },
    },
  },
  {
    id: 710,
    date: '08/11',
    type: 'transport',
    name: '移動：東尋坊 ➡ 花火會場',
    timeStart: '16:30',
    timeEnd: '17:30',
    desc: '前往停車場',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr',
        transport_mode: 'car',
        primary_info: '前往三國花火停車場',
        secondary_info: '預期交通管制',
      },
      details: {
        title: '暴風雨前的寧靜',
        content:
          '雖然從東尋坊到三國港距離不遠，但千萬別掉以輕心。三國花火大會是北陸最大的夏季盛事，此刻周邊道路已經開始實施交通管制。我們必須在人潮完全湧入前，搶先抵達預定的停車場。這是一場關於時間與耐心的博弈，提早一分鐘，可能就決定了你今晚是優雅地看煙火，還是堵在車陣中。',
        tour_guide_advice:
          '建議事先在 Google Maps 上標記好幾個備用停車場。停好車後，請確認車內備有足夠的飲用水與零食，因為等一下可能會在車上或會場待很久。',
        must_list: ['重點：提早卡位', '必備：車用充電器', '必備：離線地圖'],
      },
    },
  },
  {
    id: 711,
    date: '08/11',
    type: 'scouting',
    name: '三國花火大會',
    timeStart: '17:30',
    timeEnd: '21:00',
    desc: '水中花火',
    status: 'active',
    expenses: [],
    jp_name: '三国花火大会',
    aiData: {
      category: 'scouting',
      theme: 'dark',
      summary: {
        primary_info: '三國日落海灘',
        location_keyword: 'Mikuni Sunset Beach',
        stay_time: '3.5hr',
        one_line_tip: '北陸最大級水中花火',
        photo_guide: '捕捉海面倒影',
        tel: '+81-776-50-3152',
      },
      details: {
        title: '綻放在海面上的半圓',
        content:
          '如果說一般的花火是仰望星空，那麼三國花火就是俯瞰海洋。這是北陸最大規模的花火大會，其最大特色在於「水中花火」。花火師會乘船在行進間將煙火球直接投入海中，花火在海面上炸開成完美的半圓形，與倒映在水中的半圓結合成一個完整的圓。那一刻，天空與海洋被七彩光芒連結，伴隨著海浪聲與巨大的爆炸聲，視覺與聽覺的震撼無與倫比。',
        photographer_advice:
          '拍攝水中花火，位置決定一切。務必佔據能看到海面的低角度位置（如沙灘區）。使用 B 快門 (Bulb) 搭配快門線，光圈縮至 F8-F11，ISO 100-200。捕捉花火炸開並倒映在海面上的完整瞬間。',
        tour_guide_advice:
          '會場人潮極多，廁所大排長龍。建議在花火開始前 1 小時就解決生理需求。帶上野餐墊，吹著海風等待開演，也是一種享受。',
        must_list: [
          '必看：二尺玉水中花火',
          '必備：快門線/腳架',
          '必備：野餐墊',
        ],
      },
    },
  },
  {
    id: 712,
    date: '08/11',
    type: 'transport',
    name: '移動：撤收 ➡ 8番拉麵',
    timeStart: '21:00',
    timeEnd: '22:00',
    desc: '嚴重塞車',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr+',
        transport_mode: 'car',
        primary_info: '返回福井市區',
        secondary_info: '預期嚴重癱瘓',
      },
      details: {
        title: '撤收地獄與心理戰',
        content:
          '花火結束的瞬間，也是另一場戰爭的開始——「撤收」。數萬人同時湧出會場，周邊道路將陷入完全癱瘓。光是駛出停車場可能就需要 30-60 分鐘。這時候，請拿出你的修養與耐心。車流可能一動也不動，這在大型花火大會後是常態。',
        tour_guide_advice:
          '建議在上車前先上好廁所。準備好喜歡的音樂或 Podcast，把這段塞車時間當作是與旅伴聊天、回味花火照片的時光。',
        must_list: ['心態：保持耐心', '對策：車上娛樂', '對策：上好廁所'],
      },
    },
  },
  {
    id: 713,
    date: '08/11',
    type: 'food',
    name: '宵夜：8番拉麵',
    timeStart: '22:00',
    timeEnd: '22:45',
    desc: '北陸靈魂美食',
    status: 'active',
    expenses: [],
    jp_name: '8番らーめん 福井駅店',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        primary_info: '8番拉麵 福井站店',
        location_keyword: 'Hachiban Ramen Fukui Station',
        stay_time: '45m',
        one_line_tip: '必點野菜拉麵',
        tel: '+81-776-22-5588',
      },
      details: {
        title: '北陸人的深夜慰藉',
        content:
          '歷經了塞車的疲憊，此刻最需要的，是一碗熱騰騰的湯麵。在北陸，只要看到那個有數字「8」的魚板，心就會安頓下來。這就是「8番拉麵」，北陸人的靈魂食堂。招牌的「野菜拉麵 (Yasai Ramen)」鋪滿了炒過的清脆蔬菜，湯頭濃郁卻不油膩，每一口都能感受到蔬菜的甜味與鑊氣。',
        tour_guide_advice:
          '如果因為塞車太晚抵達，請務必先打電話確認店家的最後點餐時間 (L.O.)。如果還吃得到，強烈建議加點一份「8番餃子」，那是拉麵的最佳拍檔。',
        must_list: [
          '必吃：野菜拉麵(鹽味)',
          '必吃：8番餃子',
          '重點：確認L.O.時間',
        ],
      },
    },
  },
  {
    id: 714,
    date: '08/11',
    type: 'transport',
    name: '移動：拉麵 ➡ 飯店',
    timeStart: '22:45',
    timeEnd: '23:00',
    desc: '短程步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'walk',
        primary_info: '返回東橫INN',
        secondary_info: '結束漫長的一天',
      },
    },
  },
  {
    id: 715,
    date: '08/11',
    type: 'sight',
    name: '住宿：東橫INN',
    timeStart: '23:00',
    timeEnd: '23:59',
    desc: '休息',
    status: 'active',
    expenses: [],
    jp_name: '東横INN福井駅前',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '本日終點',
        primary_info: '東橫INN 福井站前',
        location_keyword: 'Toyoko Inn Fukui Ekimae',
        stay_time: 'Overnight',
        one_line_tip: '休息',
        tel: '+81-776-26-1045',
      },
      details: {
        title: '特種兵的安息',
        content:
          '回到飯店，雙腿可能已經痠痛，但內心卻是滿盈的。今天我們在清晨攀登了山城，在夜晚見證了海上的火花，這是一般觀光客無法體驗的「特種兵」一日。好好按摩雙腿，洗個熱水澡。明天，我們將告別福井，展開前往東北的大移動。今晚，祝你有個好夢。',
        must_list: ['重點：休足時間', '重點：備份照片', '重點：晚安'],
      },
    },
  },

  // --- Day 8: 2026/08/12 (福井勝山巡禮 -> 大移動 -> 仙台) ---
  {
    id: 800,
    date: '08/12',
    type: 'sight',
    name: '後勤：退房與裝載',
    timeStart: '07:00',
    timeEnd: '07:30',
    desc: '整理行李上車',
    status: 'active',
    expenses: [],
    jp_name: '東横INN福井駅前',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '起始錨點',
        primary_info: '東橫INN 福井站前',
        location_keyword: 'Toyoko Inn Fukui Ekimae',
        stay_time: '30m',
        one_line_tip: '行李全數上車',
        tel: '+81-776-26-1045',
      },
      details: {
        title: '大移動日的起手式',
        content:
          '今天是旅程中移動距離最長的一天，精準的後勤管理是關鍵。辦理退房時，請再次掃描房間角落，確保沒有遺漏任何物品。因為稍後還了車就要直接上新幹線，請務必將所有行李（包含昨天的戰利品）有條理地裝上租賃車。這是一個轉換心境的時刻，我們即將從日本海側跨越到太平洋側。',
        tour_guide_advice:
          '建議將稍後在新幹線上可能需要的物品（如行動電源、外套、零食）先整理在隨身包包中，避免還車時手忙腳亂。',
        must_list: ['重點：行李全數上車', '重點：隨身包整理', '必備：退房收據'],
      },
    },
  },
  {
    id: 801,
    date: '08/12',
    type: 'transport',
    name: '移動：福井 ➡ 平泉寺',
    timeStart: '07:30',
    timeEnd: '08:00',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'car',
        primary_info: '前往勝山市',
        secondary_info: '早晨車流順暢',
      },
    },
  },
  {
    id: 802,
    date: '08/12',
    type: 'sight',
    name: '平泉寺白山神社',
    timeStart: '08:00',
    timeEnd: '09:15',
    desc: '苔蘚與杉樹林',
    status: 'active',
    expenses: [],
    jp_name: '平泉寺白山神社',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '平泉寺白山神社',
        location_keyword: 'Heisenji Hakusan Shrine',
        stay_time: '1hr 15m',
        one_line_tip: '注意蚊蟲，使用CPL濾鏡',
        photo_guide: '捕捉穿透杉林的光線',
        tel: '+81-779-88-8117',
      },
      details: {
        title: '綠色寂靜的千年聖域',
        content:
          '如果說京都有苔寺，那福井就有平泉寺。踏入鳥居的那一刻，世界彷彿被按下了靜音鍵。這裡曾經是擁有數千僧兵的巨大宗教都市，如今只剩下參天古杉與覆蓋地面的厚重青苔。清晨 8 點，陽光穿透樹梢灑下「耶穌光」，斑駁的光影在翠綠的苔蘚上跳動，空氣中充滿了泥土與植物的芬芳。這是一種能洗滌心靈的綠色寂靜。',
        history:
          '這裡曾是白山信仰的中心，全盛時期勢力強大到能與織田信長抗衡，最終在戰火中燒毀，直到近代才從土層下挖掘出當年的石板路，被稱為「北陸的龐貝城」。',
        photographer_advice:
          '這裡是光影的遊樂場。強烈建議使用偏光鏡 (CPL) 消除葉面反光，讓苔蘚的綠色更飽和。尋找逆光角度，捕捉穿透杉林的神聖光束。',
        tour_guide_advice:
          '※重要提醒：這裡環境極度原始，蚊蟲非常多且兇猛。請務必噴好防蚊液或穿著長袖，否則你將無法專心感受這份寧靜。',
        must_list: ['必備：CPL偏光鏡', '必備：防蚊液', '必看：舊參道石板'],
      },
    },
  },
  {
    id: 803,
    date: '08/12',
    type: 'transport',
    name: '移動：平泉寺 ➡ 勝山城',
    timeStart: '09:15',
    timeEnd: '09:30',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'car',
        primary_info: '前往勝山城博物館',
        secondary_info: '短程移動',
      },
    },
  },
  {
    id: 804,
    date: '08/12',
    type: 'sight',
    name: '勝山城博物館',
    timeStart: '09:30',
    timeEnd: '10:45',
    desc: '日本最高天守',
    status: 'active',
    expenses: [],
    jp_name: '勝山城博物館',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '勝山城博物館',
        location_keyword: 'Katsuyama Castle Museum',
        stay_time: '1hr 15m',
        one_line_tip: '低角度廣角拍攝',
        photo_guide: '誇飾建築高度',
        tel: '+81-779-88-6200',
      },
      details: {
        title: '昭和時代的鋼筋巨獸',
        content:
          '在田園風光中，一座巨大的城堡拔地而起。這就是勝山城博物館。雖然它是現代重建的鋼筋混凝土建築（非歷史古蹟），但它擁有一個驚人的頭銜——「日本最高的天守閣」，高度達 57.8 公尺，比大阪城、名古屋城都還要高。這是一座充滿昭和時代豪情與野心的建築，巨大的龍與鯱裝飾在屋簷上，展現出一種壓倒性的魄力。',
        photographer_advice:
          '正因為它高大，我們更要誇飾它的高大。使用廣角鏡頭，盡可能貼近地面進行低角度仰拍，利用透視變形讓城堡看起來直衝雲霄。藍天下的白色牆面與金色裝飾對比強烈。',
        tour_guide_advice:
          '館內收藏了豐富的大名武具與屏風，如果你是戰國迷，這裡的展品意外地豐富。登上頂樓展望台，可以360度俯瞰勝山市的盆地美景。',
        must_list: ['必拍：日本最高天守', '必看：龍形瓦當', '體驗：天守閣展望'],
      },
    },
  },
  {
    id: 805,
    date: '08/12',
    type: 'transport',
    name: '移動：勝山城 ➡ 野村屋',
    timeStart: '10:45',
    timeEnd: '11:00',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'car',
        primary_info: '前往午餐地點',
        secondary_info: '準時避開人潮',
      },
    },
  },
  {
    id: 806,
    date: '08/12',
    type: 'food',
    name: '午餐：野村屋',
    timeStart: '11:00',
    timeEnd: '12:00',
    desc: '伏爾加飯/蘿蔔泥蕎麥麵',
    status: 'active',
    expenses: [],
    jp_name: '手打ちそば 八助',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        primary_info: '野村屋 (Nomuraya)',
        location_keyword: 'Nomuraya Katsuyama',
        stay_time: '1hr',
        one_line_tip: '伏爾加飯建議分食',
        tel: '+81-779-88-1392',
      },
      details: {
        title: '福井B級美食的雙重奏',
        content:
          '來到勝山，怎能錯過這裡獨有的B級美食「伏爾加飯 (Volga Rice)」？這是一道謎樣的料理：炒飯或白飯上覆蓋著滑嫩的歐姆蛋，再放上一塊炸豬排，最後淋上特製的醬汁（通常是紅酒醬或番茄醬底）。在「野村屋」，你可以同時點到這道熱量炸彈與清爽的「越前蘿蔔泥蕎麥麵」。濃郁與清爽，洋食與和食，在這一餐達到了奇妙的平衡。',
        tour_guide_advice:
          '伏爾加飯份量十足且口味濃厚，建議點小份或是兩人分食一份，把胃口留一點給這裡同樣出名的手打蕎麥麵。這樣的組合是勝山限定的味覺體驗。',
        must_list: [
          '必吃：伏爾加飯(小)',
          '必吃：蘿蔔泥蕎麥麵',
          '重點：分食策略',
        ],
      },
    },
  },
  {
    id: 807,
    date: '08/12',
    type: 'transport',
    name: '移動：野村屋 ➡ 越前大佛',
    timeStart: '12:00',
    timeEnd: '12:30',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'car',
        primary_info: '前往清大寺',
        secondary_info: '前往最後景點',
      },
    },
  },
  {
    id: 808,
    date: '08/12',
    type: 'sight',
    name: '越前大佛 (清大寺)',
    timeStart: '12:30',
    timeEnd: '14:30',
    desc: '千佛牆視覺震撼',
    status: 'active',
    expenses: [],
    jp_name: '越前大仏',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        primary_info: '越前大佛 (清大寺)',
        location_keyword: 'Echizen Daibutsu',
        stay_time: '2hr',
        one_line_tip: '室內光線暗，注意快門',
        photo_guide: '長焦壓縮千佛牆',
        tel: '+81-779-87-3300',
      },
      details: {
        title: '泡沫經濟下的宗教奇觀',
        content:
          '踏入清大寺的大殿，你很難不被眼前的景象震懾。17 公尺高的越前大佛端坐中央（比奈良大佛還高），而真正讓人起雞皮疙瘩的，是四周牆壁上密密麻麻、成千上萬尊的小佛像。這座建於日本泡沫經濟巔峰時期的私立寺院，雖然歷史不長，但其規模與視覺衝擊力卻是世界級的。空曠巨大的空間、無數注視著你的佛像，營造出一種超現實的、近乎科幻的宗教氛圍。',
        history:
          '由當地出身的企業家多田清斥資 380 億日圓建造，目的是為了回饋故鄉並祈求和平。雖然曾一度沒落，近年因社群媒體的傳播而成為熱門的攝影聖地。',
        photographer_advice:
          '這裡是「重複構圖 (Pattern)」的教科書。使用長焦鏡頭特寫牆面，讓佛像填滿整個畫面，創造出無限延伸的感覺。大殿內光線較暗，請提高 ISO 或使用大光圈定焦鏡。也可以嘗試將人安排在佛像前，對比出人類的渺小。',
        must_list: ['必拍：千佛牆', '必拍：17米大佛', '必看：五重塔'],
      },
    },
  },
  {
    id: 809,
    date: '08/12',
    type: 'transport',
    name: '移動：越前大佛 ➡ 福井',
    timeStart: '14:30',
    timeEnd: '15:45',
    desc: '自駕返回',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr 15m',
        transport_mode: 'car',
        primary_info: '返回 Orix 福井站前',
        secondary_info: '預留塞車緩衝',
      },
    },
  },
  {
    id: 810,
    date: '08/12',
    type: 'sight',
    name: '後勤：ORIX 還車',
    timeStart: '15:45',
    timeEnd: '16:00',
    desc: '福井站前店',
    status: 'active',
    expenses: [],
    jp_name: 'オリックスレンタカー',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        primary_info: 'Orix 福井駅前店',
        location_keyword: 'Orix Rent-A-Car Fukui',
        stay_time: '15m',
        one_line_tip: '檢查是否有遺落物',
        tel: '+81-776-22-0543',
      },
      details: {
        title: '自駕行程的終章',
        content:
          '平安回到福井站前，是時候與陪伴我們三天的座駕道別了。辦理還車手續時，請務必進行最後一次的「地毯式搜索」。門邊的置物格、遮陽板夾層、後車廂的深處，甚至是腳踏墊下，都是容易遺落物品的黑洞。別忘了拔出 ETC 卡，並確認加油收據是否已備妥（若有規定滿油還車）。',
        tour_guide_advice:
          '如果有多餘的垃圾，請詢問店員是否可以協助處理，保持禮貌是優質旅人的基本素養。',
        must_list: ['重點：拔除ETC卡', '重點：檢查遺落物', '重點：滿油證明'],
      },
    },
  },
  {
    id: 811,
    date: '08/12',
    type: 'transport',
    name: '移動：還車點 ➡ 車站',
    timeStart: '16:00',
    timeEnd: '16:15',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'walk',
        primary_info: '前往福井站',
        secondary_info: '準備搭車',
      },
    },
  },
  {
    id: 812,
    date: '08/12',
    type: 'sight',
    name: '福井站 (候車/晚餐)',
    timeStart: '16:15',
    timeEnd: '17:31',
    desc: '購買便當',
    status: 'active',
    expenses: [],
    jp_name: '福井駅',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        primary_info: '福井站',
        location_keyword: 'Fukui Station',
        stay_time: '1hr 15m',
        one_line_tip: '推薦購買越前蟹飯便當',
        tel: '+81-570-00-2486',
      },
      details: {
        title: '鐵道旅行的醍醐味：駅弁',
        content:
          '距離新幹線發車還有充裕的一個多小時。這段時間不是等待，而是為了下一段旅程的味覺準備。前往車站商場（Prism Fukui），這裡匯集了北陸的頂級便當。首推「越前蟹飯 (Echizen Kani-meshi)」，滿滿的蟹肉鋪在蟹黃炊煮的飯上，造型更是可愛的螃蟹形狀。或者選擇「烤鯖魚壽司」，油脂豐富的鯖魚經過炙烤，香氣四溢。',
        tour_guide_advice:
          '新幹線車程長達 4 小時，車上享用便當是鐵道旅行的樂趣之一。記得買幾罐福井限定的飲料或啤酒，讓移動過程也變成一種享受。',
        must_list: ['必買：越前蟹飯便當', '必買：烤鯖魚壽司', '必買：羽二重餅'],
      },
    },
  },
  {
    id: 813,
    date: '08/12',
    type: 'transport',
    name: '移動：福井 ➡ 大宮',
    timeStart: '17:31',
    timeEnd: '19:40',
    desc: 'Hakutaka 578',
    status: 'active',
    expenses: [],
    jp_name: 'はくたか',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：2hr 9m',
        transport_mode: 'public',
        primary_info: '新幹線 Hakutaka 578號',
        secondary_info: '前往大宮轉乘',
      },
      details: {
        title: '北陸新幹線 Hakutaka',
        content:
          '搭乘北陸新幹線 Hakutaka（白鷹號）經由長野前往大宮。沿途將穿越日本阿爾卑斯山脈，若天色未暗，窗外將是壯麗的山岳風景。隨著列車向東奔馳，我們正一步步告別日本海，迎向太平洋側。',
        must_list: ['車票保管', '享用便當'],
      },
    },
  },
  {
    id: 814,
    date: '08/12',
    type: 'sight',
    name: '大宮站 (轉乘)',
    timeStart: '19:40',
    timeEnd: '20:41',
    desc: '中途休息',
    status: 'active',
    expenses: [],
    jp_name: '大宮駅',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        primary_info: '大宮站',
        location_keyword: 'Omiya Station',
        stay_time: '1hr',
        one_line_tip: '站內 Ecute 逛街',
        tel: 'N/A',
      },
      details: {
        title: '新幹線的十字路口',
        content:
          '大宮站是北陸/上越新幹線與東北新幹線的交會點。轉乘時間約 1 小時，非常充裕。大宮站站內（改札內）擁有著名的 Ecute 商場，這裡不只是車站，更像個百貨公司。',
        tour_guide_advice:
          '可以下來活動筋骨，逛逛這裡的甜點店或雜貨店。如果剛剛的便當沒吃飽，這裡還有無數熟食選擇。這是一個完美的「中場休息」。',
        must_list: ['必逛：Ecute商場', '休息：伸展筋骨', '補給：飲料點心'],
      },
    },
  },
  {
    id: 815,
    date: '08/12',
    type: 'transport',
    name: '移動：大宮 ➡ 仙台',
    timeStart: '20:41',
    timeEnd: '21:47',
    desc: 'Hayabusa 57',
    status: 'active',
    expenses: [],
    jp_name: 'はやぶさ',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr 6m',
        transport_mode: 'public',
        primary_info: '新幹線 Hayabusa 57號',
        secondary_info: '前往仙台',
      },
      details: {
        title: '東北新幹線 Hayabusa',
        content:
          '搭乘最高速的 Hayabusa（隼號）前往東北門戶——仙台。這列翠綠色的新幹線以每小時 320 公里的速度奔馳，僅需一小時出頭，就能將我們帶到伊達政宗的領地。',
      },
    },
  },
  {
    id: 816,
    date: '08/12',
    type: 'sight',
    name: '仙台站 (抵達)',
    timeStart: '21:47',
    timeEnd: '22:00',
    desc: '抵達東北',
    status: 'active',
    expenses: [],
    jp_name: '仙台駅',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        primary_info: '仙台站',
        location_keyword: 'Sendai Station',
        stay_time: '13m',
        one_line_tip: '出站前往西口',
        tel: '+81-22-222-2555',
      },
      details: {
        title: '杜之都仙台',
        content:
          '抵達仙台。空氣中似乎帶著一絲東北特有的涼爽。這裡是「杜之都」（森林之都），也是東北最大的城市。雖然時間已晚，但仙台的夜生活才正要開始。我們的目標很明確——西口方向，那裡有一碗熱騰騰的黑色拉麵在等著我們。',
        must_list: ['方向：西口', '導航：末廣拉麵'],
      },
    },
  },
  {
    id: 817,
    date: '08/12',
    type: 'food',
    name: '宵夜：末廣拉麵本舖',
    timeStart: '22:00',
    timeEnd: '23:00',
    desc: '蔥花吃到飽',
    status: 'active',
    expenses: [],
    jp_name: '末廣ラーメン本舗 仙台駅前分店',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        primary_info: '末廣拉麵本舖 仙台站前分店',
        location_keyword: 'Suehiro Ramen Sendai',
        stay_time: '1hr',
        one_line_tip: '豪邁加入大量蔥花',
        tel: '+81-22-265-5118',
      },
      details: {
        title: '來自京都的黑色衝擊',
        content:
          '雖然人在仙台，但這家「末廣拉麵本舖」卻是源自京都新福菜館的直系血統。深夜的店內依舊燈火通明，招牌的「中華Soba」湯頭呈現深邃的黑色，這是濃郁醬油的證明。但最讓人興奮的，是桌上那一盆任你加的「蔥花」。',
        tour_guide_advice:
          '請不要客氣，豪邁地將大量蔥花蓋滿碗面。蔥的辛辣與清脆能完美中和濃郁鹹香的醬油湯頭，讓整碗麵的層次瞬間提升。這是一碗能撫慰長途移動疲憊的靈魂拉麵。',
        must_list: ['必吃：中華Soba', '必加：大量蔥花', '必點：黑炒飯'],
      },
    },
  },
  {
    id: 818,
    date: '08/12',
    type: 'transport',
    name: '移動：拉麵 ➡ 飯店',
    timeStart: '23:00',
    timeEnd: '23:15',
    desc: '步行',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'walk',
        primary_info: '前往住宿飯店',
        secondary_info: '仙台市區',
      },
    },
  },
  {
    id: 819,
    date: '08/12',
    type: 'sight',
    name: '住宿：東橫INN 仙台東口1號',
    timeStart: '23:15',
    timeEnd: '23:45',
    desc: 'Check-in',
    status: 'active',
    expenses: [],
    jp_name: '仙台ホテル',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        primary_info: '東橫INN 仙台東口1號',
        location_keyword: 'Sendai Hotel',
        stay_time: '30m',
        one_line_tip: '辦理入住',
        tel: '022-298-1045',
      },
      details: {
        title: '大移動日結束',
        content:
          '從福井到仙台，我們今天跨越了半個本州。完成入住手續，卸下行囊。雖然身體疲憊，但味蕾還殘留著拉麵的醬油香。好好休息吧，明天開始，我們將探索這片廣闊的東北大地。',
        must_list: ['重點：護照check-in', '重點：休息', '重點：晚安'],
      },
    },
  },

  // --- Day 8: 2025/08/13 (蔵王連峰の横断：御釜 vs 山寺) ---
  {
    id: 900,
    date: '08/13',
    type: 'hub',
    name: '退房：東橫INN 仙台東口1號',
    timeStart: '07:30',
    timeEnd: '08:00',
    desc: 'Check-out',
    status: 'active',
    expenses: [],
    jp_name: '東横INN仙台東口1号館',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '出發',
        primary_info: '東橫INN 仙台東口1號',
        location_keyword: 'Toyoko Inn Sendai East Exit 1',
        stay_time: '30m',
        one_line_tip: '檢查隨身物品，確認駕照',
        tel: '022-298-1045',
      },
      details: {
        title: '仙台的早晨',
        content:
          '辦理退房手續。今天將離開宮城縣前往山形縣，是一段跨越縣境的長途自駕旅程。請務必再次檢查護照、台灣駕照正本以及日文譯本是否都已帶在身上，切勿遺留在保險箱內。建議先在飯店大廳裝滿飲用水。',
      },
    },
  },
  {
    id: 901,
    date: '08/13',
    type: 'transport',
    name: '移動：飯店 ➡ ORIX',
    timeStart: '08:00',
    timeEnd: '08:15',
    desc: '步行前往租車點',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'walk',
        primary_info: '前往 ORIX 仙台東口店',
        secondary_info: '徒步移動',
      },
      details: {
        title: '前往起點',
        content:
          '步行前往 ORIX 租車仙台站東口店。這段路程約 15 分鐘，早晨的仙台街道相對清靜。',
      },
    },
  },
  {
    id: 902,
    date: '08/13',
    type: 'sight',
    name: '租車：ORIX 仙台東口店',
    timeStart: '08:15',
    timeEnd: '08:45',
    desc: '取車手續',
    status: 'active',
    expenses: [],
    jp_name: 'オリックスレンタカー仙台駅東口店',
    aiData: {
      category: 'logistics',
      theme: 'rose',
      summary: {
        header: '自駕啟動',
        primary_info: 'ORIX 租車 仙台站東口店',
        location_keyword: 'ORIX Rent-A-Car Sendai East',
        stay_time: '30m',
        one_line_tip: '檢查輪胎與設定導航',
        tel: '022-256-0543',
      },
      details: {
        title: '跨越藏王的夥伴',
        content:
          '辦理租車手續。由於今天要行駛藏王 Echo Line 山路，取車時請特別檢查輪胎紋路與煞車狀況。上路前請先設定好第一站「秋保大瀑布」的導航，並將手機透過藍牙連接車機，確保沿途有音樂相伴。',
        must_list: [
          '任務：檢查車身刮痕',
          '任務：設定第一站導航',
          '必備：駕照譯本',
        ],
      },
    },
  },
  {
    id: 903,
    date: '08/13',
    type: 'transport',
    name: '移動：仙台 ➡ 秋保',
    timeStart: '08:45',
    timeEnd: '09:45',
    desc: '自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr',
        transport_mode: 'car',
        primary_info: '前往秋保大瀑布',
        secondary_info: '途中經過便利商店請補給',
      },
      details: {
        title: '補給提醒',
        content:
          '這段路程約 60 分鐘。離開市區後，便利商店會變少。強烈建議在途中經過超商時，購買一些飯糰、麵包與飲料作為戰備糧食，以防藏王山上天氣突變或行程延誤導致無法準時用餐。',
      },
    },
  },
  {
    id: 904,
    date: '08/13',
    type: 'sight',
    name: '秋保大瀑布',
    timeStart: '09:45',
    timeEnd: '10:45',
    desc: '日本三名瀑',
    status: 'active',
    expenses: [],
    jp_name: '秋保大滝',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '絕景攝影',
        primary_info: '秋保大瀑布',
        location_keyword: 'Akiu Great Falls',
        stay_time: '1hr',
        one_line_tip: '推薦步行至瀧壺(瀑布底)',
        tel: '022-398-2323',
      },
      details: {
        title: '轟鳴的負離子聖地',
        content:
          '秋保大瀑布寬 6 公尺、落差 55 公尺，被列為日本三名瀑之一。這裡有兩個觀賞點：一是停車場附近的展望台，可以俯瞰全貌；二是沿著不動尊旁的陡峭階梯下行至「瀧壺（瀑布底）」。強烈推薦走下去，站在溪谷底部，水氣撲面而來的震撼感無與倫比，是感受大自然力量的最佳位置。\n\n【攝影建議】\n若天氣晴朗，上午的光線容易在飛濺的水霧中形成彩虹。建議使用廣角鏡頭帶入前景的溪石，並嘗試使用 1/4 秒左右的快門速度來表現瀑布的流動感。',
        history:
          '自古以來就是修驗道的靈場，瀑布旁的秋保大瀧不動尊供奉著不動明王，據說祈求戀愛運非常靈驗。',
        photo_advice: '下至瀧壺需走約 20 分鐘階梯，回程較累，請預留體力。',
        must_list: ['必看：瀧壺視角', '必訪：不動尊', '注意：階梯濕滑'],
      },
    },
  },
  {
    id: 905,
    date: '08/13',
    type: 'hub',
    name: '決策時刻 (天氣)',
    timeStart: '10:45',
    timeEnd: '11:00',
    desc: 'Plan A/B',
    status: 'active',
    expenses: [],
    jp_name: '分岐点',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '決策',
        primary_info: '天氣判斷點',
        location_keyword: 'Decision Point',
        stay_time: '15m',
        one_line_tip: '御釜需晴天，陰雨轉山寺',
      },
      details: {
        title: '命運的分歧點',
        content:
          '在此處查看「藏王御釜」的即時影像或天氣預報。御釜被稱為「魔女的眼睛」，如果山上起霧（白牆），將什麼都看不到。\n\n【判斷標準】\n☀️ 晴天/多雲：執行 Plan A，直攻藏王御釜。\n☁️ 陰雨/濃霧：執行 Plan B，改去山寺（立石寺）與文翔館。',
      },
    },
  },

  // --- Plan A: 藏王絕景路線 (晴天) ---
  {
    id: 906,
    date: '08/13',
    type: 'transport',
    name: '移動：秋保 ➡ 御釜',
    timeStart: '11:00',
    timeEnd: '12:30',
    desc: 'Echo Line',
    status: 'active',
    expenses: [],
    plan: 'A',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：1hr 30m',
        transport_mode: 'car',
        primary_info: '行駛藏王 Echo Line',
        secondary_info: '山岳絕景道路',
      },
      details: {
        title: '雲端駕駛',
        content:
          '行駛於著名的「藏王 Echo Line」。這是一條穿越藏王連峰的絕景道路，隨著海拔攀升，窗外的景色會從鬱鬱蔥蔥的森林轉變為高山植物與荒涼的火山地貌。打開車窗，享受涼爽的高原微風。',
      },
    },
  },
  {
    id: 907,
    date: '08/13',
    type: 'sight',
    name: '藏王御釜 (Okama)',
    timeStart: '12:30',
    timeEnd: '13:30',
    desc: '神秘火口湖',
    status: 'active',
    expenses: [],
    plan: 'A',
    jp_name: '蔵王の御釜',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '自然奇觀',
        primary_info: '藏王御釜',
        location_keyword: 'Zao Okama',
        stay_time: '1hr',
        one_line_tip: '山頂風大，務必帶外套',
        tel: '0224-34-2725',
      },
      details: {
        title: '魔女的翡翠之眼',
        content:
          '藏王連峰的象徵，強酸性的火口湖呈現迷人的翡翠綠色。湖水顏色會隨著陽光角度改變，因此又被稱為「五色沼」。站在展望台上，眼前是荒涼的岩壁與平靜的湖面形成的強烈對比，景觀極具震撼力。\n\n【攝影建議】\n最佳拍攝點是從「藏王刈田岳山頂」俯瞰。利用廣角鏡頭將火口湖與周圍荒涼的岩壁一同納入。注意山頂風勢通常非常強勁，拍攝時請掛好相機背帶，並準備防風外套。',
        history:
          '御釜是約 3000 年前火山爆發形成的火山口湖，至今仍有火山活動跡象，水溫約為 2 度。',
        must_list: ['必拍：翡翠綠湖面', '必去：刈田嶺神社', '注意：強風保暖'],
      },
    },
  },
  {
    id: 908,
    date: '08/13',
    type: 'transport',
    name: '移動：御釜 ➡ 溫泉街',
    timeStart: '13:30',
    timeEnd: '14:00',
    desc: '下山',
    status: 'active',
    expenses: [],
    plan: 'A',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'car',
        primary_info: '前往藏王溫泉街',
        secondary_info: '連續長下坡，使用低速檔',
      },
      details: {
        title: '安全駕駛提醒',
        content:
          '從御釜前往藏王溫泉街是一段連續長下坡。為了避免煞車過熱失靈（Vapor Lock），請務必切換至低速檔（B檔或L檔/2檔），利用引擎煞車來控制車速，不要長時間踩著腳煞車。',
      },
    },
  },
  {
    id: 909,
    date: '08/13',
    type: 'food',
    name: '成吉思汗烤肉 Kasheru',
    timeStart: '14:00',
    timeEnd: '15:20',
    desc: '藏王名物',
    status: 'active',
    expenses: [],
    plan: 'A',
    jp_name: 'お食事処 かしぇる',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '在地午餐',
        primary_info: '食事處 Kasheru',
        location_keyword: 'Kasheru Zao',
        stay_time: '1hr 20m',
        one_line_tip: '必吃成吉思汗烤羊肉',
        tel: '023-694-9344',
      },
      details: {
        title: '藏王羊肉傳說',
        content:
          '【空間氛圍】\n充滿昭和風情的木造食堂，店內只有幾張桌子，瀰漫著烤肉的香氣與熱鬧的煙霧。老闆娘親切的招呼聲讓人感到溫暖。\n\n【味蕾報告】\n藏王溫泉是成吉思汗烤肉的發源地之一。這裡強調使用「生羊肉」，肉質鮮嫩多汁，完全沒有冷凍羊肉的腥味。搭配店家秘製的蘋果醬汁，酸甜解膩，讓人一口接一口。羊肉的油脂被周圍的野菜吸附，蔬菜也變得異常美味。\n\n【點餐攻略】\n首推「成吉思汗定食」，若不敢吃羊肉，這裡的蕎麥麵也非常道地。',
        must_eat: ['成吉思汗定食', '自家製蘋果醬汁', '山形蕎麥麵'],
      },
    },
  },
  {
    id: 910,
    date: '08/13',
    type: 'sight',
    name: '藏王大露天風呂',
    timeStart: '15:20',
    timeEnd: '16:20',
    desc: '野趣溫泉',
    status: 'active',
    expenses: [],
    plan: 'A',
    jp_name: '蔵王温泉大露天風呂',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '溫泉體驗',
        primary_info: '藏王溫泉大露天風呂',
        location_keyword: 'Zao Onsen Open Air Bath',
        stay_time: '1hr',
        one_line_tip: '強酸性泉，不能用肥皂',
        tel: '023-694-9417',
      },
      details: {
        title: '與溪流合一的湯治',
        content:
          '這是一個可容納 200 人的巨大露天風呂，緊鄰著溪流，野趣十足。泉質是著名的強酸性硫磺泉，有「姬之湯」的美譽，能讓皮膚變得滑嫩。\n\n【重要提醒】\n這裡沒有淋浴設備，也禁止使用肥皂或洗髮精，是純粹「泡湯」的地方。泉水酸性極強，銀飾品會瞬間變黑，下水前請務必取下所有飾品。',
        must_list: ['體驗：強酸性泉質', '注意：飾品易變黑', '必備：毛巾'],
      },
    },
  },
  {
    id: 911,
    date: '08/13',
    type: 'sight',
    name: '藏王溫泉街散策',
    timeStart: '16:20',
    timeEnd: '16:50',
    desc: '散步',
    status: 'active',
    expenses: [],
    plan: 'A',
    jp_name: '蔵王温泉街',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '街區漫步',
        primary_info: '藏王溫泉街',
        location_keyword: 'Zao Onsen Street',
        stay_time: '30m',
        one_line_tip: '感受硫磺香氣，準備離開',
        tel: 'N/A',
      },
      details: {
        title: '硫磺煙霧中的散步',
        content:
          '泡完湯後，在瀰漫著硫磺味的街道上稍微散步，讓身體冷卻一下。高湯通兩旁旅館林立，保留著濃厚的溫泉鄉風情。隨後準備駕車前往山形市區。',
      },
    },
  },

  // --- Plan B: 山寺古剎路線 (白牆/雨天) ---
  {
    id: 912,
    date: '08/13',
    type: 'transport',
    name: '移動：秋保 ➡ 山寺',
    timeStart: '11:00',
    timeEnd: '11:50',
    desc: '山路移動',
    status: 'active',
    expenses: [],
    plan: 'B',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：50m',
        transport_mode: 'car',
        primary_info: '前往山寺 (立石寺)',
        secondary_info: '行駛縣道',
      },
      details: {
        title: '轉進靈山',
        content:
          '由於山上天氣不佳，轉往山寺。這段路程約 50 分鐘，沿途是寧靜的山村風景。',
      },
    },
  },
  {
    id: 913,
    date: '08/13',
    type: 'food',
    name: '午餐：對面石',
    timeStart: '11:50',
    timeEnd: '13:00',
    desc: '山寺午餐',
    status: 'active',
    expenses: [],
    plan: 'B',
    jp_name: 'お休処 対面石',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '登山前補給',
        primary_info: '休息處 對面石',
        location_keyword: 'Taimenseki Yamadera',
        stay_time: '1hr 10m',
        one_line_tip: '面對巨石的景觀餐廳',
        tel: '023-695-2116',
      },
      details: {
        title: '能量補充站',
        content:
          '【空間氛圍】\n位於山寺登山口附近，店內擁有名石「對面石」，環境古樸典雅，可以欣賞窗外的風景。\n【味蕾報告】\n提供道地的山形蕎麥麵與芋煮鍋。蕎麥麵香氣濃郁，口感滑順；芋煮則是山形的靈魂美食，醬油湯底煮入里芋與牛肉，溫暖身心。\n【點餐攻略】\n推薦「芋煮蕎麥麵套餐」，一次滿足兩種願望，為等一下的登山儲備體力。',
        must_eat: ['芋煮鍋', '板蕎麥麵', '山菜料理'],
      },
    },
  },
  {
    id: 914,
    date: '08/13',
    type: 'sight',
    name: '山寺 (立石寺)',
    timeStart: '13:00',
    timeEnd: '15:30',
    desc: '千階挑戰',
    status: 'active',
    expenses: [],
    plan: 'B',
    jp_name: '宝珠山 立石寺',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '靈場巡禮',
        primary_info: '山寺（立石寺）',
        location_keyword: 'Risshakuji Temple',
        stay_time: '2hr 30m',
        one_line_tip: '登上五大堂俯瞰山谷',
        tel: '023-695-2843',
      },
      details: {
        title: '蟬聲滲入岩石中',
        content:
          '東北四大寺之一，以松尾芭蕉的名句「閑さや 巖にしみ入る 蝉の声」聞名。挑戰 1015 階的石階，沿途穿過參天古杉，經過姥堂、弥铎岩等奇景。最終抵達「五大堂」，從懸崖舞台上俯瞰山下的村落與列車，那份開闊感會讓你忘記登山的疲憊。\n\n【攝影建議】\n五大堂的展望是必拍經典。也可以拍攝納經堂聳立在岩石上的孤高姿態，這裡是山寺最代表性的畫面。',
        history:
          '由慈覺大師圓仁於西元 860 年開山，是天台宗的靈場，也是斬斷惡緣的寺廟。',
        must_list: ['必拍：五大堂絕景', '必拍：納經堂', '體驗：1015階石階'],
      },
    },
  },
  {
    id: 915,
    date: '08/13',
    type: 'food',
    name: '甜點：常力坊',
    timeStart: '15:30',
    timeEnd: '16:00',
    desc: '下山慰勞',
    status: 'active',
    expenses: [],
    plan: 'B',
    jp_name: 'そば処 常力坊',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '甜點時間',
        primary_info: 'Soba處 常力坊',
        location_keyword: 'Jorikibo Yamadera',
        stay_time: '30m',
        one_line_tip: '櫻桃霜淇淋',
        tel: '023-695-2122',
      },
      details: {
        title: '甜蜜的獎賞',
        content:
          '下山後，雙腿肯定有些痠痛。這時候最需要來一支冰淇淋慰勞自己。這裡提供山形特產的「佐藤錦櫻桃」或「La France 西洋梨」口味霜淇淋，果香濃郁，清爽解渴。',
      },
    },
  },
  {
    id: 916,
    date: '08/13',
    type: 'transport',
    name: '移動：山寺 ➡ 山形市',
    timeStart: '16:00',
    timeEnd: '16:40',
    desc: '前往市區',
    status: 'active',
    expenses: [],
    plan: 'B',
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：40m',
        transport_mode: 'car',
        primary_info: '前往文翔館',
        secondary_info: '進入山形市區',
      },
      details: {
        title: '城市移動',
        content: '驅車前往山形市中心。這段路程約 40 分鐘。',
      },
    },
  },
  {
    id: 917,
    date: '08/13',
    type: 'sight',
    name: '文翔館 (舊縣廳)',
    timeStart: '16:40',
    timeEnd: '17:30',
    desc: '大正浪漫',
    status: 'active',
    expenses: [],
    plan: 'B',
    jp_name: '山形県郷土館 文翔館',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '建築攝影',
        primary_info: '文翔館 (舊縣廳)',
        location_keyword: 'Bunshokan',
        stay_time: '50m',
        one_line_tip: '免費參觀的歐式建築',
        tel: '023-635-5500',
      },
      details: {
        title: '紅磚的記憶',
        content:
          '這是一座建於大正時代的英國文藝復興風格建築，前身是山形縣廳。紅磚外牆與綠色屋頂非常優雅，內部保留了當年的豪華裝潢與灰泥天花板。這裡是電影《神劍闖江湖》的取景地之一。\n\n【攝影建議】\n利用廣角鏡頭拍攝正面的對稱結構。內部的中央樓梯與復古鐘樓也是絕佳的拍攝點。即使是陰雨天，室內的古典氛圍也非常好拍。',
        must_list: ['必拍：中央樓梯', '必拍：正廳', '電影巡禮：神劍闖江湖'],
      },
    },
  },

  // --- 共同結尾 ---
  {
    id: 918,
    date: '08/13',
    type: 'transport',
    name: '移動：前往飯店',
    timeStart: '17:15',
    timeEnd: '17:35',
    desc: 'Check-in',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：20m',
        transport_mode: 'car',
        primary_info: '前往山形站西口',
        secondary_info: '飯店 Check-in',
      },
      details: {
        title: '抵達據點',
        content:
          '從藏王溫泉或文翔館駕車前往今晚的住宿點：東橫INN 山形站西口。山形站西口區域道路寬敞，停車相對方便。',
      },
    },
  },
  {
    id: 919,
    date: '08/13',
    type: 'hub',
    name: '住宿：東橫INN 山形站西口',
    timeStart: '17:35',
    timeEnd: '18:05',
    desc: '入住手續',
    status: 'active',
    expenses: [],
    jp_name: '東横INN山形駅西口',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '住宿',
        primary_info: '東橫INN 山形站西口',
        location_keyword: 'Toyoko Inn Yamagata Station West',
        stay_time: '30m',
        one_line_tip: '辦理入住，停車',
        tel: '023-644-1045',
      },
      details: {
        title: '安頓與整備',
        content:
          '辦理入住手續，將大件行李放入房間。稍微整理一下儀容，準備前往今晚的重頭戲——山形牛晚餐。',
      },
    },
  },
  {
    id: 920,
    date: '08/13',
    type: 'transport',
    name: '移動：飯店 ➡ 晚餐',
    timeStart: '18:05',
    timeEnd: '18:35',
    desc: '自駕前往',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'car',
        primary_info: '前往晚餐餐廳',
        secondary_info: '預約時間不可遲到',
      },
      details: {
        title: '美食專車',
        content: '駕車前往晚餐地點。如果選擇「山牛」，請務必確認停車位置。',
      },
    },
  },
  {
    id: 921,
    date: '08/13',
    type: 'food',
    name: '晚餐：燒肉名匠 山牛 (主案)',
    timeStart: '18:35',
    timeEnd: '20:35',
    desc: '山形牛燒肉',
    status: 'active',
    expenses: [],
    jp_name: '焼肉名匠 山牛 山形店',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '頂級晚餐',
        primary_info: '燒肉名匠 山牛 山形店',
        location_keyword: 'Yakiniku Meisho Yamagyu',
        stay_time: '2hr',
        one_line_tip: '由產地直送的極品山形牛',
        tel: '023-623-2989',
      },
      details: {
        title: '肉食者的天堂',
        content:
          '【空間氛圍】\n由精肉店直營的燒肉店，裝潢採用古民家風格，充滿木頭的溫潤感，氛圍沈穩高級，適合慢慢享用美食。\n【味蕾報告】\n這裡提供的是未經冷凍的「生」山形牛。必點「山形牛一頭盛（拼盤）」，可以一次品嚐到霜降、赤身等不同部位。油脂入口即化，帶有獨特的甘甜香氣，搭配店家特製的醬汁或簡單的芥末鹽，美味直擊靈魂。\n【點餐攻略】\n除了燒肉，這裡的「生拌牛肉 (Yukke)」也是合法且極受歡迎的逸品，口感滑嫩鮮甜。',
        must_eat: ['山形牛一頭盛', '生拌牛肉 (Yukke)', '極上厚切牛舌'],
      },
    },
  },
  {
    id: 922,
    date: '08/13',
    type: 'food',
    name: '晚餐：續 Osobani (備案)',
    timeStart: '18:35',
    timeEnd: '20:35',
    desc: '深夜食堂',
    status: 'active',
    expenses: [],
    jp_name: '続おそばに',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '在地備案',
        primary_info: '續 Osobani',
        location_keyword: 'Zoku Osobani',
        stay_time: '2hr',
        one_line_tip: '營業至深夜的拉麵與蕎麥麵',
        tel: '023-623-0643',
      },
      details: {
        title: '深夜的慰藉',
        content:
          '如果燒肉店客滿或想吃點熱騰騰的湯麵，這裡是絕佳選擇。這是一家深受當地人喜愛的老店，菜單豐富，從中華拉麵到蕎麥麵應有盡有。推薦「山形拉麵」，醬油湯頭清澈卻夠味，能撫慰一整天自駕的疲憊。',
      },
    },
  },
  {
    id: 923,
    date: '08/13',
    type: 'transport',
    name: '移動：晚餐 ➡ 飯店',
    timeStart: '20:35',
    timeEnd: '20:50',
    desc: '回飯店',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：15m',
        transport_mode: 'car',
        primary_info: '返回東橫INN',
        secondary_info: '結束美好的一天',
      },
      details: { title: '歸途', content: '開車返回飯店。請注意夜間行車安全。' },
    },
  },
  {
    id: 924,
    date: '08/13',
    type: 'hub',
    name: '休息：東橫INN 山形站西口',
    timeStart: '20:50',
    timeEnd: '23:59',
    desc: '本日終點',
    status: 'active',
    expenses: [],
    jp_name: '東横INN山形駅西口',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '休息',
        primary_info: '東橫INN 山形站西口',
        location_keyword: 'Toyoko Inn Yamagata Station West',
        stay_time: 'Overnight',
        one_line_tip: '備份照片，整理儀容',
        tel: '023-644-1045',
      },
      details: {
        title: '充電時刻',
        content:
          '回到房間，今天的行程從瀑布、火山湖（或山寺）到頂級燒肉，非常充實。這時候請立刻進行照片備份，並將相機與手機電池充飽。如果時間還早，可以去附近的便利商店買些明天的早餐或飲料。好好泡個熱水澡，消除駕駛的疲勞，明天還有更多精彩等著你。',
      },
    },
  },

  // --- Day 9: 2026/08/14 (山寺朝參り、山形花火決戰) ---
  {
    id: 1000,
    date: '08/14',
    type: 'hub',
    name: '東橫INN 山形站西口',
    timeStart: '03:10',
    timeEnd: '03:40',
    desc: '超早起',
    status: 'active',
    expenses: [],
    jp_name: '東横INN山形駅西口',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '特種兵出發',
        primary_info: '東橫INN 山形站西口',
        location_keyword: 'Toyoko Inn Yamagata Station West',
        stay_time: '30m',
        one_line_tip: '攜帶腳架、快門線、防蚊液',
      },
      details: {
        title: '黎明前的出擊',
        content:
          '03:10 起床。這是一個為了絕景而燃燒的早晨。目標是「椹平梯田」的日出與晨霧。請再次檢查相機記憶卡空間，並帶上熱咖啡提神。',
      },
    },
  },
  {
    id: 1001,
    date: '08/14',
    type: 'transport',
    name: '移動：飯店 ➡ 梯田',
    timeStart: '03:40',
    timeEnd: '04:25',
    desc: '夜間自駕',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：45m',
        transport_mode: 'car',
        primary_info: '前往椹平之梯田',
        secondary_info: '山路注意野生動物',
      },
    },
  },
  {
    id: 1002,
    date: '08/14',
    type: 'sight',
    name: '椹平之梯田',
    timeStart: '04:25',
    timeEnd: '06:00',
    desc: '日本梯田百選',
    status: 'active',
    expenses: [],
    jp_name: '椹平の棚田',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '日出攝影',
        primary_info: '椹平の棚田',
        location_keyword: 'Kunugidaira Terraced Rice Fields',
        stay_time: '1hr 35m',
        one_line_tip: '從一本松公園展望台拍攝',
        tel: '0237-67-2111',
      },
      details: {
        title: '扇形的黃金大地',
        content:
          '被選為「日本梯田百選」之一。200 多塊水田呈現扇形展開，與最上川相映成趣。清晨時分，若運氣好遇到晨霧（雲海），金色的陽光灑在水田與霧氣上，是攝影師夢寐以求的畫面。',
        history: '江戶時代開發的古老梯田，由當地農家代代守護至今。',
        photo_advice:
          '請前往對面的「一本松公園」展望台，使用廣角鏡頭拍攝梯田全景，或用長焦特寫彼岸花（若有）與水田的光影。',
        must_list: ['必拍：扇形梯田', '必看：最上川晨霧', '必備：腳架'],
      },
    },
  },
  {
    id: 1003,
    date: '08/14',
    type: 'transport',
    name: '移動：梯田 ➡ 山寺',
    timeStart: '06:00',
    timeEnd: '06:50',
    desc: '移動',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：50m',
        transport_mode: 'car',
        primary_info: '前往山寺登山口',
        secondary_info: '早晨車流順暢',
      },
    },
  },
  {
    id: 1004,
    date: '08/14',
    type: 'hub',
    name: '山寺 (停車/整裝)',
    timeStart: '06:50',
    timeEnd: '07:00',
    desc: '準備登山',
    status: 'active',
    expenses: [],
    jp_name: '山寺 駐車場',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '後勤',
        primary_info: '山寺登山口',
        location_keyword: 'Yamadera Entrance',
        stay_time: '10m',
        one_line_tip: '輕裝上陣，帶水與毛巾',
      },
      details: {
        title: '千階挑戰準備',
        content:
          '將車停在附近的收費停車場。接下來要挑戰 1015 階的石階，建議將不必要的器材留在車上，只帶一機一鏡（推薦 24-70mm 焦段）與飲用水。',
      },
    },
  },
  {
    id: 1005,
    date: '08/14',
    type: 'sight',
    name: '山寺 (立石寺)',
    timeStart: '07:00',
    timeEnd: '10:00',
    desc: '松尾芭蕉名句',
    status: 'active',
    expenses: [],
    jp_name: '宝珠山 立石寺',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '靈場巡禮',
        primary_info: '山寺（立石寺）',
        location_keyword: 'Risshakuji Temple',
        stay_time: '3hr',
        one_line_tip: '登上五大堂俯瞰山谷',
        tel: '023-695-2843',
      },
      details: {
        title: '蟬聲滲入岩石中',
        content:
          '東北四大寺之一，以松尾芭蕉的名句「閑さや 巖にしみ入る 蝉の声」聞名。沿著杉木林中的石階一步步向上，沿途有姥堂、弥铎岩等奇景。最終抵達「五大堂」，從懸崖舞台上俯瞰山下的村落與列車，那份開闊感會讓你忘記登山的疲憊。',
        history:
          '由慈覺大師圓仁於西元 860 年開山，是天台宗的靈場，也是斬斷惡緣的寺廟。',
        photo_advice:
          '五大堂的展望是必拍經典。也可以拍攝納經堂聳立在岩石上的孤高姿態。早晨光線側射，立體感最佳。',
        must_list: [
          '必拍：五大堂絕景',
          '必拍：納經堂',
          '必吃：力蒟蒻 (下山後)',
        ],
      },
    },
  },
  {
    id: 1006,
    date: '08/14',
    type: 'transport',
    name: '移動：山寺 ➡ 山形市',
    timeStart: '10:00',
    timeEnd: '10:50',
    desc: '返回市區',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：50m',
        transport_mode: 'car',
        primary_info: '返回山形市區',
        secondary_info: '準備午餐',
      },
    },
  },
  {
    id: 1007,
    date: '08/14',
    type: 'hub',
    name: '山形市區 (停車)',
    timeStart: '10:50',
    timeEnd: '11:00',
    desc: '停車',
    status: 'active',
    expenses: [],
    jp_name: '山形市街地',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '後勤',
        primary_info: '七日町周邊停車場',
        location_keyword: 'Nanokamachi Parking',
        stay_time: '10m',
        one_line_tip: '停好車前往午餐',
      },
      details: {
        title: '中場休息',
        content:
          '在七日町或榮屋本店附近尋找停車場。結束了早上的體力活，現在需要美食慰勞。',
      },
    },
  },
  {
    id: 1008,
    date: '08/14',
    type: 'food',
    name: '榮屋本店 (冷拉麵)',
    timeStart: '11:00',
    timeEnd: '12:30',
    desc: '夏日必吃',
    status: 'active',
    expenses: [],
    jp_name: '栄屋本店',
    aiData: {
      category: 'activity',
      theme: 'orange',
      summary: {
        header: '必吃午餐',
        primary_info: '栄屋本店',
        location_keyword: 'Sakaeya Honten',
        stay_time: '1hr 30m',
        one_line_tip: '若昨天沒吃，今天必吃',
        tel: '023-623-0766',
      },
      details: {
        title: '元祖冷拉麵',
        content:
          '【美食分析】\n**空間氛圍**：老字號的安定感，服務親切的阿姨們穿梭其中。\n**味蕾報告**：這不是涼麵，而是真正的「冰鎮拉麵」。湯頭去除了油脂的凝固感，保留了牛骨的高雅鮮味。炎炎夏日爬完山寺後，這碗冰涼的拉麵簡直是生命之水。\n**點餐攻略**：除了冷拉麵，這裡的「山形だし (山形出汁)」豆腐也是一絕。',
        must_eat: ['冷拉麵', '山形出汁豆腐', '飯糰'],
      },
    },
  },
  {
    id: 1009,
    date: '08/14',
    type: 'hub',
    name: '東橫INN 山形站西口',
    timeStart: '12:30',
    timeEnd: '13:00',
    desc: '飯店休息',
    status: 'active',
    expenses: [],
    jp_name: '東横INN山形駅西口',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '暫停',
        primary_info: '東橫INN 山形站西口',
        location_keyword: 'Toyoko Inn Yamagata Station West',
        stay_time: '30m',
        one_line_tip: '回房洗澡、充電',
      },
      details: {
        title: '戰術性休整',
        content:
          '早起爬山後體力消耗巨大。利用這段時間回飯店洗個澡，幫手機與相機充電，為晚上的花火大會養精蓄銳。',
      },
    },
  },
  {
    id: 1010,
    date: '08/14',
    type: 'sight',
    name: '午休補眠',
    timeStart: '13:00',
    timeEnd: '15:30',
    desc: '體力回充',
    status: 'active',
    expenses: [],
    jp_name: '休憩',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '休息',
        primary_info: '飯店補眠',
        location_keyword: 'Rest',
        stay_time: '2hr 30m',
        one_line_tip: '設好鬧鐘 15:30 起床',
      },
      details: {
        title: '特種兵的休息',
        content:
          '這不是偷懶，是為了晚上的長期抗戰。山形花火大會的人潮與撤收將會非常消耗精神。請務必睡個午覺。',
        history: '休息是為了走更長遠的路。',
        photo_advice: '夢中演練花火構圖。',
        must_list: ['重點：深層睡眠', '重點：鬧鐘確認', '重點：喝水'],
      },
    },
  },
  {
    id: 1011,
    date: '08/14',
    type: 'sight',
    name: '器材準備',
    timeStart: '15:30',
    timeEnd: '16:00',
    desc: '整裝',
    status: 'active',
    expenses: [],
    jp_name: '機材準備',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '整備',
        primary_info: '器材與物資確認',
        location_keyword: 'Preparation',
        stay_time: '30m',
        one_line_tip: '腳架、快門線、野餐墊、水',
      },
      details: {
        title: '花火裝備檢查',
        content:
          '清點裝備：腳架（必備）、快門線（必備）、黑卡（選用）、野餐墊、防蚊液、手電筒、雨具、以及足夠的飲用水與乾糧。確認記憶卡空間與電池電量。',
        history: '工欲善其事，必先利其器。',
        photo_advice: '確認 B 快門設定與對焦環位置。',
        must_list: ['必備：腳架', '必備：快門線', '必備：防蚊液'],
      },
    },
  },
  {
    id: 1012,
    date: '08/14',
    type: 'transport',
    name: '移動：飯店 ➡ 花火攝點',
    timeStart: '16:00',
    timeEnd: '16:30',
    desc: '前往展望台',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'car',
        primary_info: '前往西藏王公園/三本木',
        secondary_info: '提早卡位',
      },
    },
  },
  {
    id: 1013,
    date: '08/14',
    type: 'scouting',
    name: '場勘：西藏王公園 (Plan A)',
    timeStart: '16:30',
    timeEnd: '19:00',
    desc: '夜景花火',
    status: 'active',
    expenses: [],
    jp_name: '西蔵王公園 展望広場',
    aiData: {
      category: 'scouting',
      theme: 'cyan',
      summary: {
        header: '攝點卡位',
        primary_info: '西藏王公園 展望廣場',
        location_keyword: '38.232, 140.358',
        stay_time: '2hr 30m',
        one_line_tip: '俯瞰山形夜景與花火',
        photo_guide: '長焦壓縮夜景',
      },
      details: {
        title: 'Plan A: 夜景花火',
        content:
          '【場勘邏輯】這裡可以拍攝到「山形市夜景 + 花火」的絕美畫面。距離會場較遠，花火會比較小，需要使用長焦鏡頭 (100mm+)。優點是不用人擠人，且夜景非常迷人。提早抵達佔據展望台的最佳位置。',
      },
    },
  },
  {
    id: 1014,
    date: '08/14',
    type: 'scouting',
    name: '場勘：三本木線 (Plan B)',
    timeStart: '16:30',
    timeEnd: '19:00',
    desc: '近距離震撼',
    status: 'active',
    expenses: [],
    jp_name: '市道三本木線 展望台',
    aiData: {
      category: 'scouting',
      theme: 'cyan',
      summary: {
        header: '攝點卡位',
        primary_info: '市道三本木線 展望台',
        location_keyword: 'Sambongi Line Observatory',
        stay_time: '2hr 30m',
        one_line_tip: '距離較近，仰角拍攝',
        photo_guide: '廣角至標準焦段',
      },
      details: {
        title: 'Plan B: 臨場感',
        content:
          '【場勘邏輯】如果想要更強的臨場感與聲音震撼，選擇三本木線展望台。這裡距離須川河畔的發射點較近。需注意停車空間有限，且可能需要提早更多時間卡位。',
      },
    },
  },
  {
    id: 1015,
    date: '08/14',
    type: 'sight',
    name: '山形大花火大會',
    timeStart: '19:00',
    timeEnd: '21:00',
    desc: '東北花火',
    status: 'active',
    expenses: [],
    jp_name: '山形大花火大会',
    aiData: {
      category: 'activity',
      theme: 'blue',
      summary: {
        header: '花火大會',
        primary_info: '第47回 山形大花火大会',
        location_keyword: 'Yamagata Fireworks',
        stay_time: '2hr',
        one_line_tip: '兩萬發花火的饗宴',
        tel: '023-632-8665',
      },
      details: {
        title: '須川河畔的藝術',
        content:
          '山形縣最大規模的花火大會。特色是結合了音樂的「音樂花火」以及充滿魄力的「10號玉」。若在西藏王公園，重點是捕捉花火在夜景上空綻放的層次感；若在近處，則是用廣角鏡頭收錄整個視野的震撼。',
        history: '始於 1980 年，每年吸引大量遊客，是山形夏日的風物詩。',
        photo_advice:
          '使用 B 快門，光圈 F8-F11，ISO 100。注意風向，避免煙霧遮擋。每發花火結束後適度遮擋鏡頭（黑卡）以防過曝。',
        must_list: ['必拍：音樂花火', '必拍：尺玉連發', '必備：快門線'],
      },
    },
  },
  {
    id: 1016,
    date: '08/14',
    type: 'transport',
    name: '移動：攝點 ➡ 飯店',
    timeStart: '21:00',
    timeEnd: '21:30',
    desc: '撤收',
    status: 'active',
    expenses: [],
    aiData: {
      category: 'transport',
      theme: 'gray',
      summary: {
        header: '移動：30m',
        transport_mode: 'car',
        primary_info: '返回東橫INN',
        secondary_info: '注意下山安全',
      },
    },
  },
  {
    id: 1017,
    date: '08/14',
    type: 'hub',
    name: '東橫INN 山形站西口',
    timeStart: '21:30',
    timeEnd: '22:00',
    desc: '休息',
    status: 'active',
    expenses: [],
    jp_name: '東横INN山形駅西口',
    aiData: {
      category: 'hub',
      theme: 'hub',
      summary: {
        header: '終點',
        primary_info: '東橫INN 山形站西口',
        location_keyword: 'Toyoko Inn Yamagata Station West',
        stay_time: 'Overnight',
        one_line_tip: '備份照片，休息',
      },
      details: {
        title: '充實的一天',
        content:
          '從凌晨的梯田日出到夜晚的花火大會，今天是攝影收穫滿滿的一天。回到飯店後，務必立刻備份記憶卡資料。明天將前往銀山溫泉，那是另一個夢幻的世界。晚安。',
      },
    },
  },
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
        <div className="mt-3 space-y-1 p-3 rounded-xl bg-white/50 backdrop-blur-md border border-white/30 shadow-sm">
          {item.notes.map((note, index) => (
            <div
              key={index}
              className="flex items-start gap-2 text-slate-700 text-xs"
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
  if (h < 4) return (h + 24) * 60 + m;
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
    '08/08': { A: '西岸名景', B: '東岸場勘' },
    '08/13': { A: '藏王絕景', B: '山寺古剎' },
    '08/14': { A: '西藏王公園', B: '三本木線' }, // 假設 8/14 是花火攝點 A/B
    '08/15': { A: '銀山溫泉', B: '最上川遊船' }, // 假設 8/15 的內容
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
          <div className="h-40 w-full relative group bg-white shadow-sm">
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
                  {activeTab} 行程
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
