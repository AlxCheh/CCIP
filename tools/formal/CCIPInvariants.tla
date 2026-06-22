---- MODULE CCIPInvariants ----
EXTENDS Integers, FiniteSets, TLC

CONSTANTS
  MAX_AGENTS,
  AGENTS,
  EXEMPT,
  ACTS,
  SECURITY_ACTS,
  PROCESSES

ASSUME SECURITY_ACTS \subseteq ACTS
ASSUME EXEMPT \subseteq AGENTS

VARIABLES
  agent_count,
  active,
  completed,
  has_state_update,
  dispatched_security,
  coagent_present,
  lock_holder,
  proc_state

vars == <<agent_count, active, completed, has_state_update,
          dispatched_security, coagent_present,
          lock_holder, proc_state>>

Init ==
  /\ agent_count = 0
  /\ active = {}
  /\ completed = {}
  /\ has_state_update = [a \in AGENTS |-> FALSE]
  /\ dispatched_security = {}
  /\ coagent_present = [a \in ACTS |-> FALSE]
  /\ lock_holder = "none"
  /\ proc_state = [p \in PROCESSES |-> "idle"]

SpawnAgent(a) ==
  /\ a \notin active
  /\ a \notin completed
  /\ agent_count < MAX_AGENTS
  /\ active' = active \cup {a}
  /\ agent_count' = agent_count + 1
  /\ UNCHANGED <<completed, has_state_update, dispatched_security,
                 coagent_present, lock_holder, proc_state>>

\* Compliant agent finish: agent produced ## State Update block.
FinishAgentWithUpdate(a) ==
  /\ a \in active
  /\ active' = active \ {a}
  /\ completed' = completed \cup {a}
  /\ agent_count' = agent_count - 1
  /\ has_state_update' = [has_state_update EXCEPT ![a] = TRUE]
  /\ UNCHANGED <<dispatched_security, coagent_present, lock_holder, proc_state>>

\* Non-compliant finish: agent completed WITHOUT a ## State Update block.
\* Only EXEMPT agents may skip the block; non-exempt agents are blocked by contract enforcement.
FinishAgentWithoutUpdate(a) ==
  /\ a \in active
  /\ a \in EXEMPT
  /\ active' = active \ {a}
  /\ completed' = completed \cup {a}
  /\ agent_count' = agent_count - 1
  /\ UNCHANGED <<has_state_update, dispatched_security, coagent_present, lock_holder, proc_state>>

DispatchSecurityAction(a) ==
  /\ a \in SECURITY_ACTS
  /\ a \notin dispatched_security
  /\ coagent_present' = [coagent_present EXCEPT ![a] = TRUE]
  /\ dispatched_security' = dispatched_security \cup {a}
  /\ UNCHANGED <<agent_count, active, completed, has_state_update,
                 lock_holder, proc_state>>

TryLock(p) ==
  /\ proc_state[p] = "idle"
  /\ proc_state' = [proc_state EXCEPT ![p] = "waiting"]
  /\ UNCHANGED <<agent_count, active, completed, has_state_update,
                 dispatched_security, coagent_present, lock_holder>>

AcquireLock(p) ==
  /\ proc_state[p] = "waiting"
  /\ lock_holder = "none"
  /\ lock_holder' = p
  /\ proc_state' = [proc_state EXCEPT ![p] = "critical"]
  /\ UNCHANGED <<agent_count, active, completed, has_state_update,
                 dispatched_security, coagent_present>>

TimeoutProcess(p) ==
  /\ proc_state[p] = "waiting"
  /\ proc_state' = [proc_state EXCEPT ![p] = "done"]
  /\ UNCHANGED <<agent_count, active, completed, has_state_update,
                 dispatched_security, coagent_present, lock_holder>>

ReleaseLock(p) ==
  /\ proc_state[p] = "critical"
  /\ lock_holder = p
  /\ lock_holder' = "none"
  /\ proc_state' = [proc_state EXCEPT ![p] = "done"]
  /\ UNCHANGED <<agent_count, active, completed, has_state_update,
                 dispatched_security, coagent_present>>

Next ==
  \/ \E a \in AGENTS : SpawnAgent(a)
  \/ \E a \in AGENTS : FinishAgentWithUpdate(a)
  \/ \E a \in AGENTS : FinishAgentWithoutUpdate(a)
  \/ \E a \in SECURITY_ACTS : DispatchSecurityAction(a)
  \/ \E p \in PROCESSES : TryLock(p)
  \/ \E p \in PROCESSES : AcquireLock(p)
  \/ \E p \in PROCESSES : TimeoutProcess(p)
  \/ \E p \in PROCESSES : ReleaseLock(p)

Fairness ==
  /\ \A p \in PROCESSES : WF_vars(AcquireLock(p))
  /\ \A p \in PROCESSES : WF_vars(TimeoutProcess(p))
  /\ \A p \in PROCESSES : WF_vars(ReleaseLock(p))

Spec == Init /\ [][Next]_vars /\ Fairness

AgentBudget    == agent_count <= MAX_AGENTS
StateContract  == \A a \in completed : a \notin EXEMPT => has_state_update[a] = TRUE
SecurityCoagent == \A a \in dispatched_security : coagent_present[a] = TRUE
MutualExclusion ==
  \A p \in PROCESSES : \A q \in PROCESSES :
    (proc_state[p] = "critical" /\ proc_state[q] = "critical") => p = q

EventualProgress ==
  \A p \in PROCESSES :
    proc_state[p] = "waiting" ~> proc_state[p] \in {"critical", "done"}

====
