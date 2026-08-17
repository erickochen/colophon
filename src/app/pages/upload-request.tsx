import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Send } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { SimpleFormView } from '@/app/pages/simple-form'
import { submitGuarded } from '@/lib/form-submit'
import {
  answerText, isAnswered, readAnswers, readUploadQuiz, uploadQuizDraft, writeAnswers,
  type QuizAnswers, type QuizQuestion, type UploadQuiz,
} from '@/lib/upload-quiz'
import { WizardNav, WizardSteps, useWizardStep } from '@/components/wizard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** MAM's questionnaire for upload access, one question per step. Anything the
 * question model has no shape for falls back to the plain mirrored form. */
export function UploadRequestView(props: PageProps) {
  const quiz = useMemo(() => readUploadQuiz(props.page.mainContent), [props.page.mainContent])
  if (!quiz) return <SimpleFormView {...props} />
  return <QuizWizard quiz={quiz} fallbackTitle={props.page.title} />
}

function QuestionCard({
  question, index, total, answers, onAnswer, error,
}: {
  question: QuizQuestion
  index: number
  total: number
  answers: QuizAnswers
  onAnswer: (id: string, value: string | string[]) => void
  error: string | null
}) {
  const held = answers[question.id]
  const picked = new Set(Array.isArray(held) ? held : [])
  const value = typeof held === 'string' ? held : ''
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="!py-3.5">
        <p className="text-[12px] text-muted-foreground">
          Question {index + 1} of {total}
          {question.kind === 'open' && question.required && <span className="pl-2">required</span>}
        </p>
        <CardTitle className="text-balance leading-snug">{question.prompt}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 pb-5">
        {question.kind === 'open' ? (
          question.multiline ? (
            <Textarea
              value={value}
              aria-label={question.prompt}
              aria-invalid={error ? true : undefined}
              onChange={(e) => onAnswer(question.id, e.target.value)}
              placeholder="Your answer"
              className="min-h-40 text-[13px]"
            />
          ) : (
            <Input
              value={value}
              aria-label={question.prompt}
              aria-invalid={error ? true : undefined}
              onChange={(e) => onAnswer(question.id, e.target.value)}
              placeholder="Your answer"
              className="h-10 text-[13px]"
            />
          )
        ) : (
          question.options.map((o) => (
            <FieldLabel key={o.id} className="text-[13px] font-normal">
              <Field orientation="horizontal">
                <Checkbox
                  checked={picked.has(o.id)}
                  onCheckedChange={(v) =>
                    onAnswer(
                      question.id,
                      v === true ? [...picked, o.id] : [...picked].filter((n) => n !== o.id)
                    )
                  }
                />
                <FieldTitle className="text-[13px] leading-snug">{o.label}</FieldTitle>
              </Field>
            </FieldLabel>
          ))
        )}
        {error && <p className="text-[12px] text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

function ReviewCard({
  questions, answers, onEdit,
}: {
  questions: QuizQuestion[]
  answers: QuizAnswers
  onEdit: (step: number) => void
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="!py-3.5">
        <CardTitle>Your answers</CardTitle>
        <p className="text-[12px] text-muted-foreground">Staff read every one of these, so a quick reread pays off.</p>
      </CardHeader>
      <CardContent className="grid gap-5 pb-6">
        {questions.map((q, i) => {
          const done = isAnswered(q, answers)
          const missing = !done && q.kind === 'open' && q.required
          return (
            <div key={q.id} className="grid gap-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug">
                  <span className="pr-1.5 text-muted-foreground">{i + 1}</span>
                  {q.prompt}
                </span>
                <button
                  type="button"
                  onClick={() => onEdit(i)}
                  className="shrink-0 text-[12px] text-brand hover:underline"
                >
                  Edit
                </button>
              </div>
              <p
                className={cn(
                  'whitespace-pre-wrap text-[13px] leading-snug',
                  !done && (missing ? 'text-destructive' : 'text-muted-foreground')
                )}
              >
                {done ? answerText(q, answers) : missing ? 'Required and still empty' : 'Not answered yet'}
              </p>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function QuizWizard({ quiz, fallbackTitle }: { quiz: UploadQuiz; fallbackTitle: string }) {
  const { questions } = quiz
  const review = questions.length
  const count = questions.length + 1
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [answers, setAnswers] = useState<QuizAnswers>(() => readAnswers(questions))
  const [error, setError] = useState<string | null>(null)
  // Read before the first save runs, so a form MAM redisplays with values in it
  // cannot write over the draft that is still on offer.
  const [draftOffer, setDraftOffer] = useState(() => !!uploadQuizDraft.read())
  const [sending, setSending] = useState(false)
  const stepRef = useRef<HTMLDivElement>(null)
  const landed = useRef(false)

  const stepNames = useMemo(
    () => [...questions.map((q, i) => `Question ${q.number ?? i + 1}`), 'Review'],
    [questions]
  )
  const { topRef, live } = useWizardStep(step, `${stepNames[step]}, step ${step + 1} of ${count}.`)

  // Our controls are the readable ones, MAM's are the ones that get posted.
  useEffect(() => {
    writeAnswers(questions, answers)
  }, [questions, answers])

  // A complaint belongs to the question it was raised on.
  useEffect(() => {
    setError(null)
  }, [step])

  // Typing survives a misclick. Saving waits until the offered draft is
  // answered, since writing over it first would leave nothing to pick up.
  useEffect(() => {
    if (draftOffer) return
    const typed = Object.values(answers).some((v) => (Array.isArray(v) ? v.length > 0 : v.trim().length > 0))
    if (typed) uploadQuizDraft.write({ answers, step })
  }, [answers, step, draftOffer])

  // A fresh step puts the cursor in its control. Landing on the page leaves the
  // focus alone, so the first render sits this out.
  useEffect(() => {
    if (!landed.current) {
      landed.current = true
      return
    }
    stepRef.current?.querySelector<HTMLElement>('textarea, input, [role="checkbox"]')?.focus({ preventScroll: true })
  }, [step])

  const answered = questions.filter((q) => isAnswered(q, answers)).length
  const missing = questions.findIndex((q) => q.kind === 'open' && q.required && !isAnswered(q, answers))

  function setAnswer(id: string, value: string | string[]) {
    setAnswers((s) => ({ ...s, [id]: value }))
    setError(null)
  }

  function next() {
    const q = questions[step]
    if (q?.kind === 'open' && q.required && !isAnswered(q, answers)) {
      setError('This question needs an answer before you move on.')
      return
    }
    setError(null)
    setStep(step + 1)
    setReached((r) => Math.max(r, step + 1))
  }

  // The draft outlives the send on purpose. A refused POST leaves the reader on
  // MAM's own page, where losing ten answers is the worse outcome. Once the
  // questionnaire lands it is gone from the page anyway.
  function send() {
    setSending(true)
    if (!submitGuarded(quiz.form, quiz.submitter)) setSending(false)
  }

  return (
    <div ref={topRef} className="mx-auto grid w-full max-w-3xl gap-4">
      <PageHeader
        title={quiz.title || fallbackTitle}
        sub="Answer the questionnaire, staff take it from there."
        action={
          <Badge variant="secondary" className="h-8 px-3 text-[12px] font-normal">
            {answered} of {questions.length} answered
          </Badge>
        }
      />

      <WizardSteps steps={stepNames} step={step} reached={reached} onStep={setStep} label="Questionnaire steps" />

      {draftOffer && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-4 py-2.5 text-[12.5px]">
          <span>An unfinished questionnaire is waiting.</span>
          <span className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[12px]"
              onClick={() => {
                uploadQuizDraft.clear()
                setDraftOffer(false)
              }}
            >
              Discard
            </Button>
            <Button
              size="sm"
              className="h-7 text-[12px]"
              onClick={() => {
                const draft = uploadQuizDraft.read()
                if (draft) {
                  setAnswers(draft.answers)
                  setStep(Math.min(draft.step, review))
                  setReached(Math.min(draft.step, review))
                }
                setDraftOffer(false)
              }}
            >
              Pick it up
            </Button>
          </span>
        </div>
      )}

      {step === 0 && quiz.introHtml && (
        <Card>
          <CardContent>
            <RichHtml
              html={quiz.introHtml}
              className="text-[13px] leading-normal [&_.blockFoot]:hidden [&_.blockHead]:hidden [&_a]:text-brand"
            />
          </CardContent>
        </Card>
      )}

      <div ref={stepRef}>
        {step === review ? (
          <ReviewCard questions={questions} answers={answers} onEdit={setStep} />
        ) : (
          <QuestionCard
            question={questions[step]}
            index={step}
            total={questions.length}
            answers={answers}
            onAnswer={setAnswer}
            error={error}
          />
        )}
      </div>

      <WizardNav
        step={step}
        count={count}
        onBack={() => setStep((s) => Math.max(0, s - 1))}
        hint={
          step === review && missing >= 0 ? (
            <span className="text-destructive">Question {missing + 1} still needs an answer</span>
          ) : undefined
        }
      >
        {step < review ? (
          <Button size="sm" onClick={next}>
            Next <ChevronRight />
          </Button>
        ) : (
          <Button size="sm" disabled={sending || missing >= 0} onClick={send}>
            {sending ? <><Spinner /> Sending</> : <><Send /> {quiz.submitLabel}</>}
          </Button>
        )}
      </WizardNav>

      <p aria-live="polite" className="sr-only">{live}</p>
    </div>
  )
}
