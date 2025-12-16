// src/main.jsx 標準內容
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css'; // 假設您有這個檔案

// 取得 HTML 中的根元素
const rootElement = document.getElementById('root');

// 渲染 App 元件到頁面上
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
