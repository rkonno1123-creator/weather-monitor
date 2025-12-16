"use client";

import React, { useState, useMemo } from 'react';
import { Upload, Calendar, Sun, Droplets, Gauge, FileText, AlertTriangle, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// CSVパース関数
const parseWeatherCSV = (csvText: string) => {
  const cleanedText = csvText.replace(/\x00/g, '');
  const lines = cleanedText.trim().split('\n');
  const data: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const cols = line.split(';').map(c => c.replace(/\x00/g, ''));
    if (cols.length < 12) continue;
    
    const dateStr = cols[0]?.replace(/\s/g, '');
    if (!dateStr) continue;
    
    const dateMatch = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})(\d{2}):(\d{2}):(\d{2})/);
    if (!dateMatch) continue;
    
    const [, day, month, year, hour, minute, second] = dateMatch;
    const utcDate = new Date(Date.UTC(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    ));
    
    const jstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
    
    const parseNum = (str: string) => {
      if (!str || str.trim() === '') return null;
      const cleaned = str.replace(/,/g, '').replace(/\s/g, '').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    };
    
    data.push({
      utcDate,
      jstDate,
      minute: parseInt(minute),
      temperature: parseNum(cols[2]),
      humidity: parseNum(cols[6]),
      pressure: parseNum(cols[10]),
      rain: parseNum(cols[11]),
    });
  }
  
  return data;
};

const aggregateHourlyData = (rawData: any[]) => {
  const hourlyMap = new Map();
  
  rawData.forEach(record => {
    const jst = record.jstDate;
    const dateKey = `${jst.getFullYear()}-${String(jst.getMonth() + 1).padStart(2, '0')}-${String(jst.getDate()).padStart(2, '0')}`;
    const hourKey = `${dateKey}-${String(jst.getHours()).padStart(2, '0')}`;
    
    if (!hourlyMap.has(hourKey)) {
      hourlyMap.set(hourKey, {
        dateKey,
        hour: jst.getHours(),
        jstDate: new Date(jst.getFullYear(), jst.getMonth(), jst.getDate(), jst.getHours(), 0, 0),
        records: []
      });
    }
    hourlyMap.get(hourKey).records.push(record);
  });
  
  const hourlyData: any[] = [];
  hourlyMap.forEach((hourData) => {
    let selectedRecord = null;
    for (let m = 0; m <= 50; m += 10) {
      const found = hourData.records.find((r: any) => r.minute === m && r.temperature !== null);
      if (found) {
        selectedRecord = found;
        break;
      }
    }
    
    if (!selectedRecord) {
      for (let m = 0; m <= 50; m += 10) {
        const found = hourData.records.find((r: any) => r.minute === m);
        if (found) {
          selectedRecord = found;
          break;
        }
      }
    }
    
    hourlyData.push({
      dateKey: hourData.dateKey,
      hour: hourData.hour,
      jstDate: hourData.jstDate,
      temperature: selectedRecord?.temperature ?? null,
      humidity: selectedRecord?.humidity ?? null,
      pressure: selectedRecord?.pressure ?? null,
      rain: selectedRecord?.rain ?? null,
    });
  });
  
  return hourlyData.sort((a, b) => a.jstDate - b.jstDate);
};

const aggregateDailyData = (hourlyData: any[]) => {
  const dailyMap = new Map();
  
  hourlyData.forEach(record => {
    if (!dailyMap.has(record.dateKey)) {
      dailyMap.set(record.dateKey, {
        dateKey: record.dateKey,
        date: new Date(record.jstDate.getFullYear(), record.jstDate.getMonth(), record.jstDate.getDate()),
        hourlyRecords: [],
        temperatures: [],
        humidities: [],
        pressures: [],
      });
    }
    const daily = dailyMap.get(record.dateKey);
    daily.hourlyRecords.push(record);
    if (record.temperature !== null) daily.temperatures.push(record.temperature);
    if (record.humidity !== null) daily.humidities.push(record.humidity);
    if (record.pressure !== null) daily.pressures.push(record.pressure);
  });
  
  const dailyData: any[] = [];
  dailyMap.forEach(daily => {
    const temps = daily.temperatures;
    const humids = daily.humidities;
    const press = daily.pressures;
    
    dailyData.push({
      ...daily,
      maxTemp: temps.length > 0 ? Math.max(...temps) : null,
      minTemp: temps.length > 0 ? Math.min(...temps) : null,
      avgTemp: temps.length > 0 ? temps.reduce((a: number, b: number) => a + b, 0) / temps.length : null,
      maxHumidity: humids.length > 0 ? Math.max(...humids) : null,
      minHumidity: humids.length > 0 ? Math.min(...humids) : null,
      avgHumidity: humids.length > 0 ? humids.reduce((a: number, b: number) => a + b, 0) / humids.length : null,
      maxPressure: press.length > 0 ? Math.max(...press) : null,
      minPressure: press.length > 0 ? Math.min(...press) : null,
      avgPressure: press.length > 0 ? press.reduce((a: number, b: number) => a + b, 0) / press.length : null,
      belowFiveCount: temps.filter((t: number) => t < 5).length,
      totalTempCount: temps.length,
      hasData: temps.length > 0,
    });
  });
  
  return dailyData.sort((a, b) => a.date - b.date);
};

const calcMonthlySummary = (dailyData: any[]) => {
  const allTemps = dailyData.flatMap(d => d.temperatures);
  const allHumids = dailyData.flatMap(d => d.humidities);
  const allPress = dailyData.flatMap(d => d.pressures);
  const belowFiveTotal = dailyData.reduce((sum, d) => sum + d.belowFiveCount, 0);
  const totalTempHours = dailyData.reduce((sum, d) => sum + d.totalTempCount, 0);
  const daysWithData = dailyData.filter(d => d.hasData).length;
  
  return {
    maxTemp: allTemps.length > 0 ? Math.max(...allTemps) : null,
    minTemp: allTemps.length > 0 ? Math.min(...allTemps) : null,
    avgTemp: allTemps.length > 0 ? allTemps.reduce((a: number, b: number) => a + b, 0) / allTemps.length : null,
    maxHumidity: allHumids.length > 0 ? Math.max(...allHumids) : null,
    minHumidity: allHumids.length > 0 ? Math.min(...allHumids) : null,
    avgHumidity: allHumids.length > 0 ? allHumids.reduce((a: number, b: number) => a + b, 0) / allHumids.length : null,
    maxPressure: allPress.length > 0 ? Math.max(...allPress) : null,
    minPressure: allPress.length > 0 ? Math.min(...allPress) : null,
    avgPressure: allPress.length > 0 ? allPress.reduce((a: number, b: number) => a + b, 0) / allPress.length : null,
    belowFiveHours: belowFiveTotal,
    totalTempHours: totalTempHours,
    totalDataPoints: allTemps.length,
    daysWithData,
  };
};

const formatValue = (val: number | null, decimals = 1) => {
  if (val === null || val === undefined) return '-';
  return val.toFixed(decimals);
};

export default function WeatherMonitor() {
  const [siteName, setSiteName] = useState('');
  const [rawData, setRawData] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [calendarType, setCalendarType] = useState<'temp' | 'humidity' | 'pressure'>('temp');
  
  const hourlyData = useMemo(() => aggregateHourlyData(rawData), [rawData]);
  const dailyData = useMemo(() => aggregateDailyData(hourlyData), [hourlyData]);
  const summary = useMemo(() => calcMonthlySummary(dailyData), [dailyData]);
  
  const monthInfo = useMemo(() => {
    if (dailyData.length === 0) return null;
    const firstDate = dailyData[0].date;
    return {
      year: firstDate.getFullYear(),
      month: firstDate.getMonth() + 1,
    };
  }, [dailyData]);
  
  const calendarData = useMemo(() => {
    if (!monthInfo) return [];
    
    const year = monthInfo.year;
    const month = monthInfo.month - 1;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const dailyMap = new Map(dailyData.map(d => [d.dateKey, d]));
    
    const calendar: any[][] = [];
    let week: any[] = [];
    
    for (let i = 0; i < startDayOfWeek; i++) {
      week.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const data = dailyMap.get(dateKey) || null;
      week.push({ day, dateKey, data });
      
      if (week.length === 7) {
        calendar.push(week);
        week = [];
      }
    }
    
    if (week.length > 0) {
      while (week.length < 7) {
        week.push(null);
      }
      calendar.push(week);
    }
    
    return calendar;
  }, [monthInfo, dailyData]);
  
  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null;
    return dailyData.find(d => d.dateKey === selectedDate);
  }, [selectedDate, dailyData]);
  
  const chartData = useMemo(() => {
    return dailyData.map(d => ({
      date: `${d.date.getMonth() + 1}/${d.date.getDate()}`,
      最高気温: d.maxTemp,
      平均気温: d.avgTemp ? parseFloat(d.avgTemp.toFixed(1)) : null,
      最低気温: d.minTemp,
      最高湿度: d.maxHumidity,
      平均湿度: d.avgHumidity ? parseFloat(d.avgHumidity.toFixed(0)) : null,
      最低湿度: d.minHumidity,
    }));
  }, [dailyData]);
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseWeatherCSV(text);
      setRawData(parsed);
      setSelectedDate(null);
      setShowDetail(false);
    };
    reader.readAsText(file, 'UTF-16LE');
  };
  
  const handleExportPDF = () => {
    window.print();
  };
  
  const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
  
  const calendarConfig = {
    temp: {
      title: '気温',
      getMax: (d: any) => d?.maxTemp,
      getMin: (d: any) => d?.minTemp,
      formatMax: (v: number | null) => `${formatValue(v)}°`,
      formatMin: (v: number | null) => `${formatValue(v)}°`,
      alertCondition: (d: any) => d?.minTemp !== null && d?.minTemp < 5,
      alertText: '⚠ 低温',
    },
    humidity: {
      title: '湿度',
      getMax: (d: any) => d?.maxHumidity,
      getMin: (d: any) => d?.minHumidity,
      formatMax: (v: number | null) => `${formatValue(v, 0)}%`,
      formatMin: (v: number | null) => `${formatValue(v, 0)}%`,
      alertCondition: () => false,
      alertText: '',
    },
    pressure: {
      title: '気圧',
      getMax: (d: any) => d?.maxPressure,
      getMin: (d: any) => d?.minPressure,
      formatMax: (v: number | null) => `${formatValue(v, 0)}`,
      formatMin: (v: number | null) => `${formatValue(v, 0)}`,
      alertCondition: () => false,
      alertText: '',
    }
  };
  
  const currentCalendar = calendarConfig[calendarType];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <header className="bg-slate-800/50 backdrop-blur border-b border-slate-700 sticky top-0 z-50 print:hidden">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
                <Sun className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">現場気象モニター</h1>
                <p className="text-xs text-slate-400">Weather Monitor</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="現場名を入力"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 w-40"
              />
              
              <label className="cursor-pointer bg-cyan-500 hover:bg-cyan-400 transition-colors rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2">
                <Upload className="w-4 h-4" />
                CSV読込
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
              
              {dailyData.length > 0 && (
                <button
                  onClick={handleExportPDF}
                  className="bg-slate-700 hover:bg-slate-600 transition-colors rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  PDF出力
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 py-6">
        {dailyData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-24 h-24 bg-slate-800 rounded-2xl flex items-center justify-center mb-6">
              <Upload className="w-12 h-12 text-slate-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-300 mb-2">CSVファイルをアップロード</h2>
            <p className="text-slate-500 text-sm mb-6">Weathercloudからエクスポートした気象データを読み込みます</p>
            <label className="cursor-pointer bg-cyan-500 hover:bg-cyan-400 transition-colors rounded-lg px-6 py-3 font-medium flex items-center gap-2">
              <Upload className="w-5 h-5" />
              ファイルを選択
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        ) : (
          <>
            {/* 印刷用コンテナ */}
            <div className="print-container">
              {/* 月間サマリー */}
              <section className="mb-6 print:mb-3">
                <div className="flex items-center justify-between mb-4 print:mb-2">
                  <h2 className="text-2xl font-bold print:text-base">
                    {siteName && <span className="text-cyan-400 print:text-black">{siteName}</span>}
                    {siteName && <span className="mx-2 text-slate-500 print:text-black">|</span>}
                    <span className="print:text-black">{monthInfo?.year}年{monthInfo?.month}月</span>
                  </h2>
                  <div className="text-sm text-slate-400 print:text-black print:text-xs">
                    データ取得日数: {summary.daysWithData}日
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:gap-2 print:grid-cols-4">
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 print:bg-white print:border-gray-300 print:p-2 print:rounded">
                    <div className="flex items-center gap-2 text-orange-400 mb-3 print:mb-1 print:text-orange-600">
                      <Sun className="w-5 h-5 print:w-4 print:h-4" />
                      <span className="text-sm font-medium print:text-xs">気温</span>
                    </div>
                    <div className="space-y-1 print:space-y-0">
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-sm print:text-gray-600 print:text-xs">最高</span>
                        <span className="font-mono font-bold text-red-400 print:text-red-600 print:text-xs">{formatValue(summary.maxTemp)}°C</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-sm print:text-gray-600 print:text-xs">最低</span>
                        <span className="font-mono font-bold text-blue-400 print:text-blue-600 print:text-xs">{formatValue(summary.minTemp)}°C</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-sm print:text-gray-600 print:text-xs">平均</span>
                        <span className="font-mono print:text-black print:text-xs">{formatValue(summary.avgTemp)}°C</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 print:bg-white print:border-gray-300 print:p-2 print:rounded">
                    <div className="flex items-center gap-2 text-cyan-400 mb-3 print:mb-1 print:text-cyan-600">
                      <Droplets className="w-5 h-5 print:w-4 print:h-4" />
                      <span className="text-sm font-medium print:text-xs">湿度</span>
                    </div>
                    <div className="space-y-1 print:space-y-0">
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-sm print:text-gray-600 print:text-xs">最高</span>
                        <span className="font-mono font-bold print:text-black print:text-xs">{formatValue(summary.maxHumidity, 0)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-sm print:text-gray-600 print:text-xs">最低</span>
                        <span className="font-mono font-bold print:text-black print:text-xs">{formatValue(summary.minHumidity, 0)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-sm print:text-gray-600 print:text-xs">平均</span>
                        <span className="font-mono print:text-black print:text-xs">{formatValue(summary.avgHumidity, 0)}%</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 print:bg-white print:border-gray-300 print:p-2 print:rounded">
                    <div className="flex items-center gap-2 text-purple-400 mb-3 print:mb-1 print:text-purple-600">
                      <Gauge className="w-5 h-5 print:w-4 print:h-4" />
                      <span className="text-sm font-medium print:text-xs">気圧</span>
                    </div>
                    <div className="space-y-1 print:space-y-0">
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-sm print:text-gray-600 print:text-xs">最高</span>
                        <span className="font-mono text-sm print:text-black print:text-xs">{formatValue(summary.maxPressure, 0)}hPa</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-sm print:text-gray-600 print:text-xs">最低</span>
                        <span className="font-mono text-sm print:text-black print:text-xs">{formatValue(summary.minPressure, 0)}hPa</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className={`rounded-xl p-4 border ${summary.belowFiveHours > 0 ? 'bg-blue-900/30 border-blue-700' : 'bg-slate-800/50 border-slate-700'} print:bg-white print:border-gray-300 print:p-2 print:rounded`}>
                    <div className="flex items-center gap-2 text-blue-400 mb-3 print:mb-1 print:text-blue-600">
                      <AlertTriangle className="w-5 h-5 print:w-4 print:h-4" />
                      <span className="text-sm font-medium print:text-xs">5°C以下</span>
                    </div>
                    <div className="text-2xl font-bold font-mono print:text-black print:text-base">
                      {summary.belowFiveHours}<span className="text-base text-slate-400 print:text-gray-600 print:text-xs"> / {summary.totalTempHours}</span><span className="text-lg text-slate-400 ml-1 print:text-gray-600 print:text-xs">時間</span>
                    </div>
                    {summary.belowFiveHours > 0 && (
                      <p className="text-xs text-blue-300 mt-2 print:text-blue-600 print:mt-0">低温注意</p>
                    )}
                  </div>
                </div>
              </section>
              
              {/* 気温グラフ */}
              <section className="mb-6 print:mb-3">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 print:text-black print:text-sm print:mb-2">
                  <Sun className="w-5 h-5 text-orange-400 print:text-orange-600 print:w-4 print:h-4" />
                  月間気温推移
                </h3>
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 print:bg-white print:border-gray-300 print:p-2 print:rounded">
                  <div className="h-[220px] print:h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                        <YAxis stroke="#94a3b8" fontSize={10} unit="°C" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                          labelStyle={{ color: '#e2e8f0' }}
                          itemSorter={(item) => {
                            const order: Record<string, number> = { '最高気温': 0, '平均気温': 1, '最低気温': 2 };
                            return order[item.dataKey as string] ?? 99;
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Line type="monotone" dataKey="最高気温" stroke="#f87171" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="平均気温" stroke="#a78bfa" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                        <Line type="monotone" dataKey="最低気温" stroke="#60a5fa" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
              
              {/* 湿度グラフ */}
              <section className="mb-6 print:mb-0">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 print:text-black print:text-sm print:mb-2">
                  <Droplets className="w-5 h-5 text-cyan-400 print:text-cyan-600 print:w-4 print:h-4" />
                  月間湿度推移
                </h3>
                <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 print:bg-white print:border-gray-300 print:p-2 print:rounded">
                  <div className="h-[220px] print:h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                        <YAxis stroke="#94a3b8" fontSize={10} unit="%" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                          labelStyle={{ color: '#e2e8f0' }}
                          itemSorter={(item) => {
                            const order: Record<string, number> = { '最高湿度': 0, '平均湿度': 1, '最低湿度': 2 };
                            return order[item.dataKey as string] ?? 99;
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Line type="monotone" dataKey="最高湿度" stroke="#22d3ee" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="平均湿度" stroke="#67e8f9" strokeWidth={1} strokeDasharray="5 5" dot={false} />
                        <Line type="monotone" dataKey="最低湿度" stroke="#06b6d4" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
            </div>
            
            {/* カレンダー（印刷しない） */}
            <section className="mb-8 print:hidden">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-cyan-400" />
                  カレンダー（{currentCalendar.title}）
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCalendarType('temp')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      calendarType === 'temp' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    気温
                  </button>
                  <button
                    onClick={() => setCalendarType('humidity')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      calendarType === 'humidity' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    湿度
                  </button>
                  <button
                    onClick={() => setCalendarType('pressure')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      calendarType === 'pressure' ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    気圧
                  </button>
                </div>
              </div>
              
              <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <div className="grid grid-cols-7 bg-slate-700/50">
                  {weekDays.map((day, i) => (
                    <div
                      key={day}
                      className={`py-2 text-center text-sm font-medium ${
                        i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-300'
                      }`}
                    >
                      {day}
                    </div>
                  ))}
                </div>
                
                {calendarData.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 border-t border-slate-700">
                    {week.map((cell, di) => (
                      <div
                        key={di}
                        onClick={() => cell?.data && (setSelectedDate(cell.dateKey), setShowDetail(true))}
                        className={`
                          min-h-[80px] p-2 border-r border-slate-700 last:border-r-0 transition-colors
                          ${!cell ? 'bg-slate-900/50' : ''}
                          ${cell?.data?.hasData ? 'cursor-pointer hover:bg-slate-700/50' : ''}
                          ${currentCalendar.alertCondition(cell?.data) ? 'bg-blue-900/20' : ''}
                          ${selectedDate === cell?.dateKey ? 'ring-2 ring-cyan-500 ring-inset' : ''}
                        `}
                      >
                        {cell && (
                          <>
                            <div className={`text-sm font-medium mb-1 ${
                              di === 0 ? 'text-red-400' : di === 6 ? 'text-blue-400' : 'text-slate-300'
                            }`}>
                              {cell.day}
                            </div>
                            {cell.data?.hasData ? (
                              <div className="space-y-0.5">
                                <div className="text-xs">
                                  <span className="text-red-400 font-mono">{currentCalendar.formatMax(currentCalendar.getMax(cell.data))}</span>
                                  <span className="text-slate-500 mx-1">/</span>
                                  <span className="text-blue-400 font-mono">{currentCalendar.formatMin(currentCalendar.getMin(cell.data))}</span>
                                </div>
                                {currentCalendar.alertCondition(cell.data) && (
                                  <div className="text-xs text-blue-300">{currentCalendar.alertText}</div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-600">-</div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
            
            {/* 日別詳細モーダル */}
            {showDetail && selectedDayData && (
              <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 print:hidden">
                <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-auto">
                  <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
                    <h3 className="text-xl font-bold">
                      {selectedDayData.date.getMonth() + 1}月{selectedDayData.date.getDate()}日の詳細
                    </h3>
                    <button
                      onClick={() => setShowDetail(false)}
                      className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="p-6">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="text-sm text-slate-400 mb-1">気温</div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-red-400 font-mono text-lg">{formatValue(selectedDayData.maxTemp)}°</span>
                          <span className="text-slate-500">/</span>
                          <span className="text-blue-400 font-mono text-lg">{formatValue(selectedDayData.minTemp)}°</span>
                        </div>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="text-sm text-slate-400 mb-1">湿度</div>
                        <div className="font-mono text-lg">
                          {formatValue(selectedDayData.maxHumidity, 0)} - {formatValue(selectedDayData.minHumidity, 0)}%
                        </div>
                      </div>
                      <div className="bg-slate-700/50 rounded-lg p-3">
                        <div className="text-sm text-slate-400 mb-1">気圧</div>
                        <div className="font-mono text-lg">
                          {formatValue(selectedDayData.maxPressure, 0)} - {formatValue(selectedDayData.minPressure, 0)}hPa
                        </div>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="py-2 px-3 text-left text-slate-400 font-medium">時刻</th>
                            <th className="py-2 px-3 text-right text-slate-400 font-medium">気温 (°C)</th>
                            <th className="py-2 px-3 text-right text-slate-400 font-medium">湿度 (%)</th>
                            <th className="py-2 px-3 text-right text-slate-400 font-medium">気圧 (hPa)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 24 }, (_, h) => {
                            const record = selectedDayData.hourlyRecords.find((r: any) => r.hour === h);
                            const isCold = record?.temperature !== null && record?.temperature < 5;
                            return (
                              <tr key={h} className={`border-b border-slate-700/50 ${isCold ? 'bg-blue-900/20' : ''}`}>
                                <td className="py-2 px-3 font-mono">{String(h).padStart(2, '0')}:00</td>
                                <td className={`py-2 px-3 text-right font-mono ${isCold ? 'text-blue-400 font-bold' : ''}`}>
                                  {formatValue(record?.temperature)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono">{formatValue(record?.humidity, 0)}</td>
                                <td className="py-2 px-3 text-right font-mono">{formatValue(record?.pressure, 0)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      
      {/* 印刷用スタイル */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .min-h-screen {
            min-height: auto !important;
            background: white !important;
          }
          .bg-gradient-to-br {
            background: white !important;
          }
          .text-white {
            color: black !important;
          }
          .bg-slate-800\\/50, .bg-slate-800 {
            background: white !important;
          }
          .border-slate-700 {
            border-color: #e5e7eb !important;
          }
          .text-slate-400, .text-slate-500 {
            color: #6b7280 !important;
          }
        }
      `}</style>
    </div>
  );
}
