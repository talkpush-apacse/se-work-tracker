import { useState, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, ScatterChart, Scatter, Legend,
} from 'recharts';
import { useAppStore } from '../context/StoreContext';
import { getThisWeekRange, getLastWeekRange, filterPointsByRange, formatDate } from '../utils/dateHelpers';
import { ACTIVITY_COLORS } from '../constants';
import { format, parseISO, startOfWeek, startOfMonth, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, endOfMonth, endOfWeek } from 'date-fns';

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#0ea5e9'];

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-gray-400 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>{p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(p.name?.includes('hrs') ? 1 : 0) : p.value}</strong></p>
      ))}
    </div>
  );
};

export default function Analytics({ onNavigate }) {
  const { projects, customers, okrs, points } = useAppStore();
  const [rangeMode, setRangeMode] = useState('thisWeek'); // thisWeek | lastWeek | custom
  const [granularity, setGranularity] = useState('daily');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [compareWeeks, setCompareWeeks] = useState(false);

  const { start, end } = useMemo(() => {
    if (rangeMode === 'thisWeek') return getThisWeekRange();
    if (rangeMode === 'lastWeek') return getLastWeekRange();
    if (customStart && customEnd) return { start: new Date(customStart), end: new Date(customEnd) };
    return getThisWeekRange();
  }, [rangeMode, customStart, customEnd]);

  const filteredPoints = useMemo(() => filterPointsByRange(points, start, end), [points, start, end]);
  const lastWeekPoints = useMemo(() => {
    const { start: ls, end: le } = getLastWeekRange();
    return filterPointsByRange(points, ls, le);
  }, [points]);

  // 4A: By project
  const byProject = useMemo(() => {
    const map = {};
    filteredPoints.forEach(p => {
      if (!map[p.projectId]) map[p.projectId] = { pts: 0, hrs: 0 };
      map[p.projectId].pts += p.points;
      map[p.projectId].hrs += p.hours;
    });
    return Object.entries(map)
      .map(([id, v]) => {
        const proj = projects.find(p => p.id === id);
        const cust = customers.find(c => c.id === proj?.customerId);
        return { name: proj?.name || 'Unknown', pts: v.pts, hrs: parseFloat(v.hrs.toFixed(1)), color: cust?.color || '#6366f1' };
      })
      .sort((a, b) => b.pts - a.pts);
  }, [filteredPoints, projects, customers]);

  // 4B: By customer
  const byCustomer = useMemo(() => {
    const map = {};
    filteredPoints.forEach(p => {
      const proj = projects.find(pr => pr.id === p.projectId);
      const custId = proj?.customerId || '_none';
      if (!map[custId]) map[custId] = { pts: 0, hrs: 0 };
      map[custId].pts += p.points;
      map[custId].hrs += p.hours;
    });
    return Object.entries(map)
      .map(([id, v]) => {
        const cust = customers.find(c => c.id === id);
        return { name: cust?.name || 'Unknown', pts: v.pts, hrs: parseFloat(v.hrs.toFixed(1)), color: cust?.color || '#6366f1' };
      })
      .sort((a, b) => b.pts - a.pts);
  }, [filteredPoints, projects, customers]);

  // 4C: By activity type
  const byActivity = useMemo(() => {
    const map = {};
    filteredPoints.forEach(p => {
      const key = p.activityType || 'General';
      if (!map[key]) map[key] = { pts: 0, hrs: 0 };
      map[key].pts += p.points;
      map[key].hrs += p.hours;
    });
    const total = Object.values(map).reduce((s, v) => s + v.pts, 0);
    return Object.entries(map)
      .map(([name, v]) => ({ name, pts: v.pts, hrs: parseFloat(v.hrs.toFixed(1)), pct: total ? Math.round((v.pts / total) * 100) : 0, color: ACTIVITY_COLORS[name] || '#6366f1' }))
      .sort((a, b) => b.pts - a.pts);
  }, [filteredPoints]);

  // 4D: By OKR
  const byOkr = useMemo(() => {
    const map = {};
    filteredPoints.forEach(p => {
      const proj = projects.find(pr => pr.id === p.projectId);
      const rawOkrId = proj?.okrId;
      // Validate that the OKR still exists; otherwise group as unassigned
      const okrId = (rawOkrId && okrs.some(o => o.id === rawOkrId)) ? rawOkrId : '_none';
      if (!map[okrId]) map[okrId] = { pts: 0, hrs: 0 };
      map[okrId].pts += p.points;
      map[okrId].hrs += p.hours;
    });
    return Object.entries(map)
      .map(([id, v]) => {
        const okr = okrs.find(o => o.id === id);
        return { name: okr?.title || 'Unassigned', pts: v.pts, hrs: parseFloat(v.hrs.toFixed(1)) };
      })
      .sort((a, b) => b.pts - a.pts);
  }, [filteredPoints, projects, okrs]);

  // 4E: Time trend
  const timeTrend = useMemo(() => {
    let intervals = [];
    if (granularity === 'daily') {
      intervals = eachDayOfInterval({ start, end }).map(d => ({ date: d, label: format(d, 'MMM d'), key: format(d, 'yyyy-MM-dd') }));
    } else if (granularity === 'weekly') {
      intervals = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map(d => ({ date: d, label: format(d, 'MMM d'), key: format(d, 'yyyy-ww') }));
    } else {
      intervals = eachMonthOfInterval({ start, end }).map(d => ({ date: d, label: format(d, 'MMM yyyy'), key: format(d, 'yyyy-MM') }));
    }

    const projectIds = [...new Set(filteredPoints.map(p => p.projectId))];

    return intervals.map(({ label, date, key }) => {
      const row = { label };
      let total = 0;
      let lastWeekTotal = 0;

      projectIds.forEach(pid => {
        const proj = projects.find(p => p.id === pid);
        const ptsInInterval = filteredPoints.filter(p => {
          const d = parseISO(p.timestamp);
          if (granularity === 'daily') return format(d, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');
          if (granularity === 'weekly') return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd') === format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
          return format(d, 'yyyy-MM') === format(date, 'yyyy-MM');
        }).filter(p => p.projectId === pid);
        const sum = ptsInInterval.reduce((s, p) => s + p.points, 0);
        row[proj?.name || pid] = sum;
        total += sum;
      });

      if (compareWeeks) {
        const lwInInterval = lastWeekPoints.filter(p => {
          const d = parseISO(p.timestamp);
          if (granularity === 'daily') {
            const dayOfWeek = d.getDay();
            const startDayOfWeek = date.getDay();
            return dayOfWeek === startDayOfWeek;
          }
          return true;
        });
        lastWeekTotal = lwInInterval.reduce((s, p) => s + p.points, 0);
        row['Last Week'] = lastWeekTotal;
      }

      row.total = total;
      return row;
    });
  }, [filteredPoints, lastWeekPoints, projects, start, end, granularity, compareWeeks]);

  const projectLines = useMemo(
    () => [...new Set(filteredPoints.map(p => p.projectId))].map((pid, i) => ({
      pid, name: projects.find(p => p.id === pid)?.name || pid, color: CHART_COLORS[i % CHART_COLORS.length],
    })),
    [filteredPoints, projects]
  );

  // 4F: Hours scatter
  const hoursScatter = useMemo(() => {
    return byProject.map(p => ({ ...p, x: p.hrs, y: p.pts, z: 10 }));
  }, [byProject]);

  const inputClass = "bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
      </div>

      {/* Filters */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Range */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Time Period</span>
            <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
              {[['thisWeek', 'This Week'], ['lastWeek', 'Last Week'], ['custom', 'Custom']].map(([v, l]) => (
                <button key={v} onClick={() => setRangeMode(v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${rangeMode === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>{l}</button>
              ))}
            </div>
          </div>
          {rangeMode === 'custom' && (
            <div className="flex items-center gap-2 self-end">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className={inputClass} />
              <span className="text-gray-500 text-sm">to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className={inputClass} />
            </div>
          )}
          {/* Divider between filter groups */}
          <div className="w-px h-10 bg-gray-700 flex-shrink-0 self-end" />
          {/* Granularity */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Granularity</span>
            <div aria-label="View by" className="flex bg-gray-800 rounded-xl p-1 gap-1">
              {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([v, l]) => (
                <button key={v} onClick={() => setGranularity(v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${granularity === v ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>{l}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
            <input type="checkbox" checked={compareWeeks} onChange={e => setCompareWeeks(e.target.checked)} className="rounded" />
            Compare to last week
          </label>
        </div>
      </div>

      {filteredPoints.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl py-20 text-center">
          <BarChart3 size={36} className="text-gray-700 mx-auto mb-4" />
          <p className="text-base font-semibold text-gray-400 mb-2">No data yet</p>
          <p className="text-sm text-gray-600 mb-6">Start logging points on your projects to see your activity here.</p>
          {onNavigate && (
            <button
              onClick={() => onNavigate('projects')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Go to Projects →
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 4A: By Project */}
            <Section title="Points by Project">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byProject} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="pts" name="Points" radius={[0, 4, 4, 0]}>
                    {byProject.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>

            {/* 4B: By Customer */}
            <Section title="Points by Customer">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byCustomer} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={80} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="pts" name="Points" radius={[0, 4, 4, 0]}>
                    {byCustomer.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 4C: Activity Type */}
            <Section title="Activity Type Breakdown">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={byActivity} dataKey="pts" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {byActivity.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {byActivity.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                      <span className="text-xs text-gray-300 flex-1 truncate">{a.name}</span>
                      <span className="text-xs font-bold text-white">{a.pts} pts</span>
                      <span className="text-xs text-gray-500 w-8 text-right">{a.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>

            {/* 4D: OKR */}
            <Section title="OKR Investment Analysis">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byOkr} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="pts" name="Points" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="hrs" name="Hours" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Section>
          </div>

          {/* 4E: Time Trend */}
          <Section title="Points Over Time">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={timeTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                {compareWeeks && <Line type="monotone" dataKey="Last Week" stroke="#374151" strokeWidth={2} dot={false} strokeDasharray="4 4" />}
                {projectLines.length <= 4 ? (
                  projectLines.map(({ name, color }) => (
                    <Line key={name} type="monotone" dataKey={name} stroke={color} strokeWidth={2} dot={false} />
                  ))
                ) : (
                  <Line type="monotone" dataKey="total" name="Total Points" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </Section>

          {/* 4F: Hours Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Hours by Project">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byProject} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="hrs" name="Hours" radius={[0, 4, 4, 0]}>
                    {byProject.map((entry, i) => <Cell key={i} fill={entry.color + 'bb'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>

            <Section title="Efficiency: Points vs Hours">
              <ResponsiveContainer width="100%" height={240}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis type="number" dataKey="x" name="Hours" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'Hours', position: 'insideBottomRight', offset: -5, fill: '#6b7280', fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name="Points" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'Points', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs shadow-xl">
                        <p className="text-white font-medium">{d.name}</p>
                        <p className="text-gray-400">{d.y} pts · {d.x}h</p>
                      </div>
                    );
                  }} />
                  <Scatter name="Projects" data={hoursScatter} fill="#6366f1">
                    {hoursScatter.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-600 mt-2 text-center">High points + low hours = efficient wins. High hours + low points = time sinks.</p>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
