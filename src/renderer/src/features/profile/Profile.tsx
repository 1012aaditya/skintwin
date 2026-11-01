import { Droplet, Flag, Heart, History, Pencil, Sparkles, Target, UserRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { label } from '@shared/models'
import { LineChart } from '@renderer/components/LineChart'
import { Orb } from '@renderer/components/Orb'
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, ProgressRing } from '@renderer/components/ui'
import { formatDate } from '@renderer/lib/format'
import { navigate } from '@renderer/lib/router'
import { mutate, useDb } from '@renderer/lib/store'
import { MetricTile, summaryScore } from '../analysis/Analyze'
import { AgeSelect, AvoidList, ConcernPicker, GoalPicker, PreferencePicker, profileCompleteness, SensitivityPicker, SkinTypePicker, TonePicker } from './fields'

type Section = 'identity' | 'concerns' | 'goals' | 'preferences' | null

export function Profile() {
  const db = useDb()
  const p = db.profile
  const [editing, setEditing] = useState<Section>(null)
  const latest = db.analyses[0]
  const real = db.analyses.filter((a) => !a.isMock)
  const completeness = profileCompleteness(p)
  const edit = (s: Section) => (
    <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => setEditing(s)}>
      <Pencil className="h-4 w-4" />
    </Button>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] gap-6 max-[1180px]:grid-cols-1">
        <div className="flex items-center gap-6">
          <div className="relative">
            <Orb size={150} mood="happy" />
          </div>
          <div>
            <h1 className="text-[44px] leading-[1.02] font-semibold tracking-tight">
              My <span className="text-gradient">Skin Profile</span>
            </h1>
            <p className="mt-2 text-ink-soft">Your skin identity, goals and analysis history.</p>
            <div className="mt-3 flex items-center gap-2">
              <Input className="h-9 w-48" defaultValue={db.displayName ?? ''} placeholder="Your name" aria-label="Display name" onBlur={(e) => mutate({ type: 'user.setName', name: e.target.value || null })} />
            </div>
          </div>
        </div>
        <Card strong className="flex items-center gap-6 p-6">
          {latest ? (
            <>
              <ProgressRing value={summaryScore(latest).value} size={130} label={summaryScore(latest).value ?? '—'} sublabel={summaryScore(latest).label} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Your skin at a glance</h2>
                    <p className="text-[13px] text-ink-soft">Latest analysis · {formatDate(latest.createdAt)} {latest.isMock && <Badge tone="demo" size="sm">Mock</Badge>}</p>
                  </div>
                  <Button size="sm" variant="primary" onClick={() => navigate(`/progress?analysis=${encodeURIComponent(latest.id)}`)}>
                    View full analysis
                  </Button>
                </div>
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {latest.metrics.slice(0, 5).map((m) => (
                    <MetricTile key={m.key} m={m} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <EmptyState className="w-full" icon={<Sparkles />} title="No skin analysis yet" body="Run a YouCam analysis to see hydration, oil control, texture and more." action={<Button variant="primary" onClick={() => navigate('/analyze')}>Analyze my skin</Button>} />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-4 gap-5 max-[1280px]:grid-cols-2">
        <Card className="p-5">
          <CardHeader icon={<UserRound />} title="Skin identity" action={edit('identity')} />
          <dl className="mt-4 space-y-3 text-[14px]">
            {[
              ['Skin type', label(p.skinType)],
              ['Sensitivity', label(p.sensitivity)],
              ['Tone', label(p.skinTone)],
              ['Age range', label(p.ageRange)]
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-ink-soft">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex items-center gap-2 text-[13px] text-ink-soft">
            <ProgressRing value={completeness} size={38} stroke={4} label={<span className="text-[10px]">{completeness}</span>} /> Profile completeness
          </div>
        </Card>
        <ListCard icon={<Target />} title="My concerns" items={p.concerns.map(label)} empty="No concerns added" action={edit('concerns')} />
        <ListCard icon={<Flag />} title="My goals" items={p.goals.map(label)} empty="No goals added" action={edit('goals')} />
        <ListCard icon={<Heart />} title="My preferences" items={[...p.preferences.map(label), ...p.avoidIngredients.map((a) => `Avoid: ${a}`)]} empty="No preferences added" action={edit('preferences')} />
      </div>

      <Card className="p-6">
        <CardHeader icon={<History />} title="Analysis history" subtitle={real.length ? `${real.length} saved YouCam analys${real.length === 1 ? 'is' : 'es'}` : undefined} action={<Button size="sm" onClick={() => navigate('/progress')}>View all analyses</Button>} />
        {real.length >= 2 ? (
          <div className="mt-4">
            <LineChart
              points={real
                .slice(0, 8)
                .reverse()
                .flatMap((a) => {
                  const v = summaryScore(a).value
                  return v == null ? [] : [{ x: formatDate(a.createdAt, { month: 'short', day: 'numeric' }), y: v }]
                })}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">{real.length === 1 ? 'One analysis so far — a trend appears after your second analysis.' : 'No real analyses yet.'}</p>
        )}
      </Card>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={{ identity: 'Skin identity', concerns: 'Concerns', goals: 'Goals', preferences: 'Preferences', '': '' }[editing ?? '']!} wide>
        <div className="space-y-6">
          {editing === 'identity' && (
            <>
              <Field label="Skin type"><SkinTypePicker profile={p} /></Field>
              <Field label="Sensitivity"><SensitivityPicker profile={p} /></Field>
              <Field label="Skin tone"><TonePicker profile={p} /></Field>
              <Field label="Age range"><AgeSelect profile={p} /></Field>
            </>
          )}
          {editing === 'concerns' && <ConcernPicker profile={p} />}
          {editing === 'goals' && <GoalPicker profile={p} />}
          {editing === 'preferences' && (
            <>
              <Field label="Ingredient preferences"><PreferencePicker profile={p} /></Field>
              <Field label="Ingredients to avoid"><AvoidList profile={p} /></Field>
            </>
          )}
          <p className="text-xs text-ink-faint">Changes save automatically.</p>
        </div>
      </Dialog>
    </div>
  )
}

function ListCard({ icon, title, items, empty, action }: { icon: ReactNode; title: string; items: string[]; empty: string; action: ReactNode }) {
  return (
    <Card className="p-5">
      <CardHeader icon={icon} title={title} action={action} />
      <div className="mt-4 flex flex-wrap gap-2">
        {items.length ? items.map((i) => <Badge key={i} tone="lilac">{i}</Badge>) : <p className="flex items-center gap-2 text-sm text-ink-faint"><Droplet className="h-4 w-4" />{empty}</p>}
      </div>
    </Card>
  )
}
