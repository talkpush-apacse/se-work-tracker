import { useState, useMemo, useRef } from 'react';
import { Trophy, Zap, Clock, Flame, Activity, TrendingUp, Star, Plus, Timer, Users, Brain, MessageSquare, ClipboardList } from 'lucide-react';
import { useAppStore } from '../context/StoreContext';
import { useTimerContext } from '../context/TimerContext';
import { startOfWeek, format } from 'date-fns';
import { getThisWeekRange, filterPointsByRange, formatRelative, formatDateTime, getStreakDays } from '../utils/dateHelpers';
import AddPointsModal from '../components/AddPointsModal';
import ConfirmDialog from '../components/ConfirmDialog';
import { WORK_TYPES, WORK_TYPE_LABELS, WORK_TYPE_COLORS } from '../constants';

const WORK_TYPE_ICONS_MAP = {
  deep_work: Brain,
  meetings:  Users,
  comms:     MessageSquare,
  admin:     ClipboardList,
};

function CustomerBadge({ customerId, customers, size = 'sm' }) {
  const c = customers.find(x => x.id === customerId);
  if (!c) return null;
  const sz = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sz}`}
      style={{ backgroundColor: (c.color || '#6366f1') + '22', color: c.color || '#6366f1', border: `1px solid ${c.color || '#6366f1'}40` }}
    >
      {c.name}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'text-brand-lavender bg-brand-lavender/10',
    violet: 'text-purple-700 bg-purple-50',
    amber: 'text-brand-amber bg-amber-500/10',
    emerald: 'text-brand-sage bg-brand-sage/10',
    rose: 'text-red-700 bg-red-50',
  };
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className={`inline-flex p-2 rounded-xl mb-3 ${colors[color]}`}>
        <Icon size={18} className={colors[color].split(' ')[0]} />
      </div>
      <p className="text-2xl font-mono font-bold text-foreground">{value}</p>
      <p className="text-sm font-sans text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const { customers, okrs, points, tasks, timeLogs, getWorkTypeTargets } = useAppStore();
  const { isRunning, clientIds: runningClientIds, startTimer, stopTimer } = useTimerContext();
  const [addModal, setAddModal] = useState(null); // holds customer object for AddPointsModal
  const [timerConflict, setTimerConflict] = useState(null); // holds the customer to start after conflict
  const [flashId, setFlashId] = useState(null);

  // Week stats — only recompute when points array changes
  const { weekPoints, totalPts, totalHrs, topCustomer, topActivity, streak } = useMemo(() => {
    const { start, end } = getThisWeekRange();
    const wp = filterPointsByRange(points, start, end);
    const pts = wp.reduce((s, p) => s + p.points, 0);
    const hrs = wp.reduce((s, p) => s + p.hours, 0);

    // Most active customer this week
    const customerWeekPoints = {};
    wp.forEach(p => { customerWeekPoints[p.customerId] = (customerWeekPoints[p.customerId] || 0) + p.points; });
    const topCustomerId = Object.entries(customerWeekPoints).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topCust = customers.find(c => c.id === topCustomerId);

    // Most common activity this week
    const actCounts = {};
    wp.forEach(p => { const key = p.activityType || 'General'; actCounts[key] = (actCounts[key] || 0) + p.points; });
    const topAct = Object.entries(actCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    return { weekPoints: wp, totalPts: pts, totalHrs: hrs, topCustomer: topCust, topActivity: topAct, streak: getStreakDays(points) };
  }, [points, customers]);

  // Active customers = customers with any tasks or points
  const activeCustomerCount = useMemo(() => {
    const active = new Set();
    tasks.forEach(t => { if (t.customerId) active.add(t.customerId); });
    points.forEach(p => { if (p.customerId) active.add(p.customerId); });
    return active.size;
  }, [tasks, points]);

  // Customer Leaderboard: all customers sorted by total points
  const leaderboard = useMemo(
    () => customers.map(customer => {
      const entries = points.filter(pt => pt.customerId === customer.id);
      const totalPoints = entries.reduce((s, e) => s + e.points, 0);
      const totalHours = entries.reduce((s, e) => s + e.hours, 0);
      const lastActivity = entries.reduce((latest, e) =>
        !latest || e.timestamp > latest ? e.timestamp : latest, null);
      const taskCount = tasks.filter(t => t.customerId === customer.id).length;
      return { ...customer, totalPoints, totalHours, lastActivity, taskCount };
    }).filter(c => c.totalPoints > 0 || c.taskCount > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints),
    [customers, points, tasks]
  );

  const maxPoints = leaderboard[0]?.totalPoints || 1;

  // OKR health — direct point lookup via okrId
  const okrHealth = useMemo(
    () => okrs.map(okr => {
      const okrPts = points.filter(pt => pt.okrId === okr.id);
      const okrPoints = okrPts.reduce((s, e) => s + e.points, 0);
      const okrHours = okrPts.reduce((s, e) => s + e.hours, 0);
      const taskCount = tasks.filter(t => t.okrId === okr.id).length;
      return { ...okr, taskCount, totalPoints: okrPoints, totalHours: okrHours };
    }).sort((a, b) => b.totalPoints - a.totalPoints),
    [okrs, points, tasks]
  );

  // This week's work type breakdown from timeLogs
  const weekKey = useMemo(() => format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'), []);
  const workTypeHours = useMemo(() => {
    const hours = { deep_work: 0, meetings: 0, comms: 0, admin: 0 };
    timeLogs.forEach(log => {
      if (log.weekStart === weekKey && hours[log.workType] !== undefined) {
        hours[log.workType] += log.hours || 0;
      }
    });
    Object.keys(hours).forEach(k => { hours[k] = Math.round(hours[k] * 100) / 100; });
    return hours;
  }, [timeLogs, weekKey]);

  const totalWorkTypeHours = useMemo(
    () => WORK_TYPES.reduce((s, wt) => s + workTypeHours[wt], 0),
    [workTypeHours]
  );

  const currentTargets = useMemo(() => {
    const saved = getWorkTypeTargets(weekKey);
    return saved?.targets || { deep_work: 20, meetings: 8, comms: 8, admin: 4 };
  }, [weekKey, getWorkTypeTargets]);

  // Recent activity feed — sort+slice only when points changes
  const recentActivity = useMemo(
    () => [...points]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 15)
      .map(entry => {
        const customer = customers.find(c => c.id === entry.customerId);
        return { ...entry, customer };
      }),
    [points, customers]
  );

  const handlePointSuccess = (entry) => {
    setFlashId(entry.customerId);
    setTimeout(() => setFlashId(null), 1000);
  };

  const rankIcon = (i) => {
    if (i === 0) return <Trophy size={16} className="text-amber-700" />;
    if (i === 1) return <span className="text-muted-foreground font-bold text-sm">2</span>;
    if (i === 2) return <span className="text-orange-600 font-bold text-sm">3</span>;
    return <span className="text-muted-foreground/70 text-sm font-medium">{i + 1}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            This week: <span className={totalPts > 0 ? 'text-brand-lavender font-semibold' : 'text-muted-foreground'}>{Number(totalPts).toFixed(1)} pts</span> across <span className={weekPoints.length > 0 ? 'text-brand-lavender font-semibold' : 'text-muted-foreground'}>{weekPoints.length}</span> entries
          </p>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
            <Flame size={16} className="text-orange-600" />
            <span className="text-sm font-bold text-orange-600">{streak} day streak</span>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Zap} label="Points this week" value={Number(totalPts).toFixed(1)} color="indigo" />
        <StatCard icon={Clock} label="Hours this week" value={totalHrs.toFixed(1)} color="violet" />
        <StatCard icon={Star} label="Top customer" value={topCustomer?.name || 'None yet'} sub="this week" color="amber" />
        <StatCard icon={Activity} label="Top activity" value={topActivity ? topActivity.split(' ')[0] : 'None yet'} sub="by points" color="emerald" />
        <StatCard icon={Users} label="Active customers" value={activeCustomerCount} color="rose" />
      </div>

      {/* This Week by Work Type */}
      {totalWorkTypeHours > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {WORK_TYPES.map(wt => {
            const Icon = WORK_TYPE_ICONS_MAP[wt];
            const hrs = workTypeHours[wt];
            const target = currentTargets[wt] || 0;
            const pct = totalWorkTypeHours > 0 ? Math.round((hrs / totalWorkTypeHours) * 100) : 0;
            return (
              <div key={wt} className="bg-card border border-border rounded-2xl p-4">
                <div className={`inline-flex p-2 rounded-xl mb-2 ${WORK_TYPE_COLORS[wt].bg}`}>
                  <Icon size={16} className={WORK_TYPE_COLORS[wt].text} />
                </div>
                <p className="text-lg font-mono font-bold text-foreground">{hrs}h</p>
                <p className="text-sm text-muted-foreground">{WORK_TYPE_LABELS[wt]}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  {pct}% of total · {target > 0 ? `${target}h target` : 'no target'}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-4 text-center text-sm text-muted-foreground">
          Start tracking by work type to see your bandwidth breakdown here.
        </div>
      )}

      {/* Weekly summary banner */}
      {totalPts > 0 && (
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-border rounded-2xl p-4">
          <p className="text-sm text-foreground">
            <span className="font-bold text-foreground">Weekly Summary:</span> You've invested{' '}
            <span className="text-amber-700 font-bold">{Number(totalPts).toFixed(1)} points</span> and{' '}
            <span className="text-brand-sage font-bold">{totalHrs.toFixed(1)}h</span> across{' '}
            {new Set(weekPoints.map(p => p.customerId).filter(Boolean)).size} customers.
            {topCustomer && <> Top focus: <span className="text-brand-lavender/80 font-semibold">{topCustomer.name}</span>.</>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Leaderboard */}
        <div className="xl:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2"><Trophy size={16} className="text-amber-700" /> Customer Leaderboard</h2>
            <span className="text-xs text-muted-foreground">By total points</span>
          </div>
          {leaderboard.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-muted-foreground text-sm">No customer activity yet.</p>
              <button onClick={() => onNavigate('customers')} className="mt-3 text-sm text-brand-lavender hover:text-brand-lavender/80">Add your first customer →</button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {leaderboard.map((customer, i) => {
                const pct = maxPoints > 0 ? (customer.totalPoints / maxPoints) * 100 : 0;
                const isFlashing = flashId === customer.id;

                return (
                  <div
                    key={customer.id}
                    className={`px-5 py-3.5 hover:bg-card-hover transition-colors ${i === 0 ? 'bg-amber-50/50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 flex items-center justify-center flex-shrink-0">{rankIcon(i)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold text-sm ${i === 0 ? 'text-foreground' : 'text-foreground'}`}>{customer.name}</span>
                          <span className="text-[10px] text-muted-foreground">{customer.taskCount} tasks</span>
                        </div>
                        <div className="mt-1.5 h-1 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: customer.color || '#6366f1' }}
                          />
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="relative">
                          <p className={`font-mono font-bold text-sm ${i === 0 ? 'text-amber-700' : 'text-foreground'}`}>{Number(customer.totalPoints).toFixed(1)} pts</p>
                          {isFlashing && (
                            <span className="point-flash absolute -top-1 right-0 text-xs font-bold text-amber-700 whitespace-nowrap">+pts!</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{customer.totalHours.toFixed(1)}h</p>
                      </div>
                      {/* Timer button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isRunning && !runningClientIds.includes(customer.id)) {
                            setTimerConflict(customer);
                          } else if (!isRunning) {
                            startTimer('deep_work', { clientIds: [customer.id] });
                          }
                          // If already running for THIS customer, widget is visible — no action needed
                        }}
                        className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                          runningClientIds.includes(customer.id)
                            ? 'bg-brand-sage/30 text-brand-sage cursor-default'
                            : 'bg-muted/50 hover:bg-brand-sage/20 text-muted-foreground hover:text-brand-sage'
                        }`}
                        title={runningClientIds.includes(customer.id) ? 'Timer running' : 'Start timer'}
                      >
                        <Timer size={13} />
                      </button>
                      {/* Add points button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setAddModal(customer); }}
                        className="p-1.5 rounded-lg bg-brand-lavender/20 hover:bg-brand-lavender/40 text-brand-lavender transition-colors flex-shrink-0"
                        title="Add points"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground flex items-center gap-2"><Activity size={16} className="text-brand-lavender" /> Recent Activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Activity size={28} className="text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-1">No activity yet</p>
              <p className="text-xs text-muted-foreground/70 mb-4">Log points for your customers to see your work history here.</p>
              <button
                onClick={() => onNavigate('triage')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-lavender hover:text-brand-lavender/80 transition-colors"
              >
                Log your first points →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border max-h-96 overflow-y-auto scrollbar-thin">
              {recentActivity.map(entry => (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{entry.customer?.name || 'Unknown'}</p>
                      <p className="text-[11px] text-muted-foreground">{entry.activityType || 'General'}</p>
                      {entry.comment && <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{entry.comment}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-sm font-bold text-brand-lavender">+{Number(entry.points).toFixed(1)}</span>
                      <p className="text-[10px] text-muted-foreground/70">{formatRelative(entry.timestamp)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* OKR Health */}
      {okrHealth.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">OKR Investment Health</h2>
            <span className="text-xs text-muted-foreground">Are you working on the right things?</span>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {okrHealth.map((okr) => {
              const maxOkrPts = okrHealth[0]?.totalPoints || 1;
              const pct = maxOkrPts > 0 ? (okr.totalPoints / maxOkrPts) * 100 : 0;
              return (
                <button
                  key={okr.id}
                  onClick={() => onNavigate('okrs')}
                  className="bg-secondary/50 rounded-xl p-4 border border-border/50 text-left w-full cursor-pointer hover:border-primary/50 hover:bg-card-hover transition-all"
                >
                  <p className="text-sm font-semibold text-foreground leading-snug mb-3 line-clamp-2">{okr.title}</p>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{okr.taskCount} task{okr.taskCount !== 1 ? 's' : ''}</span>
                    <span className="text-foreground font-mono font-bold">{Number(okr.totalPoints).toFixed(1)} pts · {okr.totalHours.toFixed(1)}h</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {addModal && (
        <AddPointsModal
          customer={addModal}
          onClose={() => setAddModal(null)}
          onSuccess={handlePointSuccess}
        />
      )}

      {timerConflict && (
        <ConfirmDialog
          title="Timer Already Running"
          message={`A timer is already running. Stop it first (you'll be prompted to save), then start a new timer for "${timerConflict.name}".`}
          danger={false}
          onConfirm={() => { stopTimer(); setTimerConflict(null); }}
          onCancel={() => setTimerConflict(null)}
        />
      )}
    </div>
  );
}
