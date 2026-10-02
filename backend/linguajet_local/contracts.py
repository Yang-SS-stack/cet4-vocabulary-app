"""Strict, summary-only wire contract; no learning algorithms."""
from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, AfterValidator, model_validator, BeforeValidator

MAX = 9007199254740991
Count = Annotated[int, Field(ge=0, le=MAX)]
Signed = Annotated[int, Field(ge=-MAX, le=MAX)]
ID = Annotated[str, Field(min_length=1, max_length=200)]
Token = Annotated[str, Field(pattern=r'^[a-f0-9]{64}$')]
Credential = Annotated[str, Field(pattern=r'^[A-Za-z0-9_-]{43}$')]

def date_string(v):
    if date.fromisoformat(v).isoformat()!=v: raise ValueError('date')
    return v

def utc_string(v):
    import re
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z',v): raise ValueError('time')
    datetime.fromisoformat(v.replace('Z','+00:00'))
    return v

def uuid_string(v):
    if str(UUID(v))!=v: raise ValueError('uuid')
    return v

Date = Annotated[str, AfterValidator(date_string)]
UTC = Annotated[str, AfterValidator(utc_string)]
Uuid = Annotated[str, AfterValidator(uuid_string)]
class StrictModel(BaseModel):
    model_config=ConfigDict(strict=True,extra='forbid')
class Basis(StrictModel):
    localDate: Date
    generatedAt: UTC
    timeZone: Annotated[str,Field(min_length=1,max_length=100)] | None
    selectedWordBookId: ID | None
    snapshotToken: Token
    factsToken: Token
class Settings(StrictModel):
    examDate: Date | None
    todayWordBookId: ID | None
    dailyNewWords: Count | None
    dailyReviewWords: Count | None
    dailyStudyMinutes: Count | None
    pronunciation: Literal['en-GB','en-US']
    mistakeStudyWords: Count | None
class Book(StrictModel):
    id: ID | None
    label: ID | None
    totalWords: Count | None
    completedWords: Count
class Task(StrictModel):
    wordBookId: ID | None
    assignedWords: Count
    completedWords: Count
    remainingWords: Count
    @model_validator(mode='after')
    def relationships(self):
        if self.completedWords>self.assignedWords or self.remainingWords!=self.assignedWords-self.completedWords: raise ValueError('task')
        return self
class Extra(Task):
    batchCount: Count
    @model_validator(mode='after')
    def empty_batch(self):
        if self.batchCount==0 and any((self.assignedWords,self.completedWords,self.remainingWords)): raise ValueError('batch')
        return self
class Today(StrictModel):
    learning: Task | None
    review: Task | None
    extraLearning: Extra | None
class ReviewLoad(StrictModel):
    wordBookId: ID | None
    dueCount: Count | None
    outsideTodayTaskCount: Count | None
    needsReconciliation: bool
    @model_validator(mode='after')
    def relationships(self):
        if (self.dueCount is None)!=(self.outsideTodayTaskCount is None): raise ValueError('load')
        if self.dueCount is not None and self.outsideTodayTaskCount>self.dueCount: raise ValueError('load')
        return self
class Completions(StrictModel):
    learningWords: Count | None
    extraLearningWords: Count | None
    reviewWords: Count | None
class Assessment(StrictModel):
    known: Count
    fuzzy: Count
    unknown: Count
class Choices(StrictModel):
    correct: Count
    incorrect: Count
    showAnswer: Count
class Corrections(StrictModel):
    fromSelfAssessment: Count
    fromChoice: Count
class Coverage(StrictModel):
    eventCompleteness: Literal['not-provable']
    taskCount: Count
    tasksWithoutEvents: Count
    legacyTaskCount: Count
    @model_validator(mode='after')
    def relationships(self):
        if max(self.tasksWithoutEvents,self.legacyTaskCount)>self.taskCount: raise ValueError('coverage')
        return self
Issue=Literal['duplicate-event','conflicting-event','invalid-correction','completion-source-conflict','catalog-mismatch']
class Period(StrictModel):
    fromDate: Date
    toDate: Date
    wordBookId: ID | None
    completions: Completions
    selfAssessments: Assessment | None
    choices: Choices | None
    corrections: Corrections | None
    effectiveSelfAssessments: Assessment | None
    coverage: Coverage
    issues: Annotated[list[Issue],Field(max_length=5)]
    @model_validator(mode='after')
    def relationships(self):
        if len(set(self.issues))!=len(self.issues): raise ValueError('issues')
        conflict=bool({'conflicting-event','invalid-correction'} & set(self.issues))
        if any(v is None for v in (self.selfAssessments,self.choices,self.corrections,self.effectiveSelfAssessments)) and not conflict: raise ValueError('distribution')
        if any(v is None for v in self.completions.model_dump().values()) and 'completion-source-conflict' not in self.issues: raise ValueError('completion')
        raw,cor,eff=self.selfAssessments,self.corrections,self.effectiveSelfAssessments
        if eff is not None:
            if raw is None or cor is None: raise ValueError('effective')
            if cor.fromSelfAssessment>raw.known or (eff.known,eff.fuzzy,eff.unknown)!=(raw.known-cor.fromSelfAssessment,raw.fuzzy+cor.fromSelfAssessment,raw.unknown): raise ValueError('effective')
        elif raw is not None and cor is not None and cor.fromSelfAssessment>raw.known: raise ValueError('correction')
        return self
class History(StrictModel):
    today: Period
    last7Days: Period
class Recommendation(StrictModel):
    source: Literal['rules']
    remainingWords: Count
    daysRemaining: Signed | None
    deadlineDailyWords: Count | None
    recommendedDailyWords: Count | None
    exceedsDailyWordLimit: bool | None
    estimatedMinutes: Count | None
    overloaded: bool | None
def strict_version(v):
    if type(v) is not int: raise ValueError('version')
    return v

class Facts(StrictModel):
    contractVersion: Annotated[Literal[1], BeforeValidator(strict_version)]
    requestId: Uuid
    basis: Basis
    settings: Settings
    book: Book
    today: Today
    reviewLoad: ReviewLoad
    history: History
    ruleRecommendation: Recommendation | None
    @model_validator(mode='after')
    def relationships(self):
        if type(self.contractVersion) is not int: raise ValueError('version')
        r=self.ruleRecommendation
        if r is not None:
            if self.book.totalWords is None: raise ValueError('catalog')
            if self.settings.examDate is None and r.daysRemaining is not None: raise ValueError('exam')
            if self.settings.examDate is None or (r.daysRemaining is not None and r.daysRemaining<=0):
                if any(v is not None for v in (r.deadlineDailyWords,r.recommendedDailyWords,r.exceedsDailyWordLimit)): raise ValueError('deadline')
            quantities=self.settings.dailyNewWords is not None and self.settings.dailyReviewWords is not None
            if not quantities and (r.estimatedMinutes is not None or r.overloaded is not None): raise ValueError('estimate')
            if self.settings.dailyStudyMinutes is None and r.overloaded is not None: raise ValueError('estimate')
        selected=self.basis.selectedWordBookId
        if self.book.id!=selected or self.reviewLoad.wordBookId!=selected: raise ValueError('book')
        d=self.basis.localDate
        if self.history.today.fromDate!=d or self.history.today.toDate!=d or self.history.last7Days.toDate!=d or self.history.last7Days.fromDate!=(date.fromisoformat(d)-timedelta(days=6)).isoformat(): raise ValueError('range')
        for p in (self.history.today,self.history.last7Days):
            if p.wordBookId!=selected: raise ValueError('book')
            if 'catalog-mismatch' in p.issues and self.ruleRecommendation is not None: raise ValueError('catalog')
            if selected is None:
                values=list(p.completions.model_dump().values())
                for distribution in (p.selfAssessments,p.choices,p.corrections,p.effectiveSelfAssessments):
                    if distribution is None: raise ValueError('no book')
                    values.extend(distribution.model_dump().values())
                values.extend([p.coverage.taskCount,p.coverage.tasksWithoutEvents,p.coverage.legacyTaskCount])
                if any(v!=0 for v in values): raise ValueError('no book')
        if selected is None and (self.book.label is not None or self.book.totalWords is not None or self.book.completedWords!=0 or self.reviewLoad.dueCount is not None or self.reviewLoad.outsideTodayTaskCount is not None): raise ValueError('no book')
        return self
class Pairing(StrictModel):
    connectionCode: str
