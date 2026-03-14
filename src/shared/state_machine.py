"""
Generic finite state machine — used by Medbridge (patient phases), Zapier (event status).
Type-safe, logs every transition, guards supported.
"""
from dataclasses import dataclass, field
from typing import TypeVar, Generic, Callable, Any
from datetime import datetime, timezone

S = TypeVar("S")
E = TypeVar("E")

@dataclass
class Transition(Generic[S, E]):
    from_state: S
    event: E
    to_state: S
    guard: Callable[[dict], bool] | None = None
    on_enter: Callable[[S, S, dict], None] | None = None  # (from, to, context)

@dataclass
class TransitionLog:
    from_state: Any
    event: Any
    to_state: Any
    context: dict
    occurred_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class StateMachine(Generic[S, E]):
    def __init__(self, initial: S, transitions: list[Transition]):
        self.state = initial
        self._index: dict[tuple, Transition] = {(t.from_state, t.event): t for t in transitions}
        self._history: list[TransitionLog] = []

    def can_transition(self, event: E, context: dict = None) -> bool:
        t = self._index.get((self.state, event))
        if not t:
            return False
        if t.guard and not t.guard(context or {}):
            return False
        return True

    def transition(self, event: E, context: dict = None) -> S:
        context = context or {}
        key = (self.state, event)
        t = self._index.get(key)
        if not t:
            raise ValueError(f"Invalid transition: state={self.state!r} event={event!r}")
        if t.guard and not t.guard(context):
            raise ValueError(f"Guard failed: state={self.state!r} event={event!r}")
        prev = self.state
        self.state = t.to_state
        log = TransitionLog(from_state=prev, event=event, to_state=self.state, context=context)
        self._history.append(log)
        if t.on_enter:
            t.on_enter(prev, self.state, context)
        return self.state

    @property
    def history(self) -> list[TransitionLog]:
        return list(self._history)

    def history_as_dicts(self) -> list[dict]:
        return [{"from": str(l.from_state), "event": str(l.event),
                 "to": str(l.to_state), "at": l.occurred_at} for l in self._history]
