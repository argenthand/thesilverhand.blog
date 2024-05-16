---
title: Intro to XState
date: 2024-05-13
summary: "Learning the basics of XState by designing a stateful toggle switch."
tags: [ "react", "xstate" ]
published: true
---

Learning about FSMs and using them to build complex UIs.

Every CompSci student learns about [finite-state machines](https://en.wikipedia.org/wiki/Finite-state_machine) at some
point in their learning journey. I first learned about the concept back in university over a decade ago, but I only
recently learned to use them to build React apps.

A couple of years ago, I came across [this talk](https://www.youtube.com/watch?v=HPoC-k7Rxwo) by David K. Piano, the
creator of XState. It served as an introduction to what XState can do in the context of React apps.

## Example

### v1

I started with the most basic component I could think of: a checkbox. There are only 2 possible values: the box can be
checked or unchecked. Starting simple allowed me to keep my focus on the state machine instead of getting bogged down
in my app’s business logic. I laid out the following requirements:

1. There should be a `<form>` on the page.
2. The form should have a single checkbox and a save button (to save the state of the checkbox to the “database” - the
   browser’s local storage in this case)
3. Whenever the page is loaded, the machine should use the saved value from local storage.

With these requirements, I set out to implement my simple machine. Here’s what I came up with:

```js
import {assign, setup} from 'xstate';

const toggleMachine = setup({
  actions: {
    logAction: ({context, event}) => {
      console.log(`Action: ${event.type} | Toggle State: ${context.toggleState}`);
    },
    updateContext: assign({
      toggleState: ({context}) => !context.toggleState
    })
  }
}).createMachine({
  id: 'toggle-machine',
  context: ({input}) => ({
    toggleState: input.savedState ?? false
  }),
  initial: 'turned-off',
  states: {
    'turned-off': {
      on: {
        TOGGLE: {
          target: 'turned-on',
          actions: ['logAction', 'updateContext']
        }
      }
    },
    'turned-on': {
      on: {
        TOGGLE: {
          target: 'turned-off',
          actions: ['logAction', 'updateContext']
        }
      }
    }
  }
});

export default toggleMachine;
```

Let’s go over this. We have two states, "turned-off" and "turned-on". The machine starts in the "turned-off" state, and
sending the "TOGGLE" event will transition between the two states. Each transition also has a couple of
[actions](https://stately.ai/docs/actions)that get executed. I’m using named actIons in the machine, which is a fancy
way of saying defining them as strings
inside the machine, and provide the implementations later. There are a couple of ways to provide your machine with
implementations, I’m using the `setup` helper to do it here.

With each transition, I’m logging the event and context to the console, and I’m updating the `toggleState` value to
keep track of the user’s selection. [Context](https://stately.ai/docs/context) is the internal state of the machine (
similar to the state and context concepts in React). It lets us keep track of any data we want from inside the machine
without having to worry about
setState functions and render cycles. It’s my favourite feature in XState!

Since I’m saving the toggle value in my database, I also want to retrieve it so my users can pick up where they left
off. I’m using XState’s `input` property for this. I like to think of `input` as a function parameter I pass to the
machine. XState uses it to create the internal context value `toggleState`, which should - in theory - let the machine
start with whatever the user saved last.

I have the machine, so how do I use it? I wrote a `ToggleSwitch` component that implements the machine using some
helpful hooks from the `@xstate/react` package according to my requirements above.

```jsx
const STORAGE_KEY = "toggleSwitch";

function restoreSavedToggleState() {
  if (window == undefined) return false;
  const savedToggleState = JSON.parse(
    window.localStorage.getItem(STORAGE_KEY)
  );
  return savedToggleState ?? false;
}

function saveToggleState(value) {
  const stringifiedValue = JSON.stringify(value);
  window.localStorage.setItem(STORAGE_KEY, stringifiedValue);
}

export default function ToggleSwitch() {
  const savedState = restoreSavedToggleState();
  const [state, send] = useMachine(toggleMachine, {
    input: {
      savedState // initial value from db, false by default
    }
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveToggleState(state.context.toggleState);
      }}
    >
      <div>
        <input
          type="checkbox"
          name="toggle-checkbox"
          value="toggle"
          checked={state.context?.toggleState}
          onChange={() => send({type: 'TOGGLE'})}
        />
        <label htmlFor="toggle-checkbox">Some value</label>
      </div>
      <button type="submit">Save</button>
    </form>
  );
}
```

Looks clean, doesn't it? I have no state setters, reducers, or any of that in here! All I need to make it
functional is
the state object that contains my toggleState value, and the send function, which sends an event to my machine. All the
work of handling the state changes and keeping track of transitions is handled by XState. To save/restore the toggle
state, I use the helper methods that leverage localStorage.

And that’s that! I have a functioning form according to my requirement, and life is good…

### Performance Concerns

…Not quite. As feature complete as my toggle component is, there is a problem with its implementation. Any time I
toggle the checkbox, it triggers the `restoreSavedToggleState` function. This is a problem. It’s not really noticeable
in my implementation right now since I’m dealing with a single value with nothing else of substance on the page, but
localStorage operations are expensive (as are DB operations/API calls). I want to make it so that the machine only
reads the saved state once, when the page is first loaded/refreshed.

### v2

In v1 of my implementation, I use the `useMachine` hook to instantiate my machine. The drawback here is that any time
my component re-renders, it re-instantiates the machine, and that leads to `input.savedState` being recalculated, which
is effectively a wasted call, since the context is immediately updated in a transition anyway. XState even warns you if
the machine changes between renders as a result of `useMachine` being repeatedly called.

However, there is another way. The `@xstate/react` package offers a variety of hooks to counter this. Here’s the
updated implementation:

```js
import {assign, setup} from 'xstate';

const STORAGE_KEY = "toggleSwitch";

const toggleMachine = setup({
  actions: {
    logAction: ({context, event}) => {
      console.log(`Action: ${event.type} | Toggle State: ${context.toggleState}`);
    },
    updateContext: assign({
      toggleState: ({context}) => !context.toggleState
    }),
    restoreState: assign({
      toggleState: () => {
        if (window == undefined) {
          return false
        }
        return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) ?? false;
      }
    }),
  }
}).createMachine({
  id: 'toggle-machine',
  entry: ['restoreState'],
  context: {
    toggleState: false
  },
  initial: 'turned-off',
  states: {
    'turned-off': {
      on: {
        TOGGLE: {
          target: 'turned-on',
          actions: ['logAction', 'updateContext']
        }
      }
    },
    'turned-on': {
      on: {
        TOGGLE: {
          target: 'turned-off',
          actions: ['logAction', 'updateContext']
        }
      }
    }
  }
});

export default toggleMachine;
```

The main change is that the function to restore the state from localStorage now lives inside the machine itself as an
entry action, which will trigger whenever the machine is initialized. I’ll also need to change my component.

```jsx
const STORAGE_KEY = "toggleSwitch";

function saveToggleState(value) {
  const stringifiedValue = JSON.stringify(value);
  window.localStorage.setItem(STORAGE_KEY, stringifiedValue);
}

export default function ToggleSwitch() {
  const actorRef = useActorRef(toggleMachine);
  const toggleState = useSelector(actorRef, selectToggleState);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const actorSnapshot = actorRef.getSnapshot();
      saveToggleState(actorRef.context.toggleState);
    }}>
      <div>
        <input
          type="checkbox"
          name="toggle-checkbox"
          value="toggle"
          checked={toggleState}
          onChange={() => actorRef.send({type: 'TOGGLE'})}
        />
        <label htmlFor="toggle-checkbox">Some value</label>
      </div>
      <button type="submit">Save</button>
    </form>
  );
}
```

Instead of the `useMachine` hook, I’m now using the `useActorRef` and `useSelector` hooks, which prevent unnecessary
re-renders of my machine (I think they use observers inspired by rxjs to achieve this, but that’s outside the scope of
this article). Now my component fetches the saved toggle state value only once, and subsequent changes to the checkbox
toggle do not trigger refetches from localStorage. Yay!

### One more thing

There’s one very small bug in the machine. See if you can spot it in the video above. Did you see it? I’ll tell you
anyway. There’s an action in the machine that logs the performed transition to the console. It’s also supposed to log
the current state of the toggle switch. But it logs the previous value instead! The problem is in the order of the
actions. XState executes actions in the order in which they’re defined. In my machine, I’m defining the `logAction`
action before the `updateContext` action, so it’ll log `context.toggleState` to console first and then update its
value. All I need to do to fix this is switch the actions around.

```js
const toggleMachine = setup({
  actions: {
    logAction: ({context, event}) => {
      console.log(`Action: ${event.type} | Toggle State: ${context.toggleState}`);
    },
    updateContext: assign({
      toggleState: ({context}) => !context.toggleState
    }),
    restoreState: assign({
      toggleState: () => {
        const key = "toggleSwitch";
        if (window == undefined) {
          return false
        }
        return JSON.parse(window.localStorage.getItem(key)) ?? false;
      }
    }),
  }
}).createMachine({
  id: 'toggle-machine',
  entry: ['restoreState'],
  context: {
    toggleState: false
  },
  initial: 'turned-off',
  states: {
    'turned-off': {
      on: {
        TOGGLE: {
          target: 'turned-on',
          actions: ['updateContext', 'logAction']
        }
      }
    },
    'turned-on': {
      on: {
        TOGGLE: {
          target: 'turned-off',
          actions: ['updateContext', 'logAction']
        }
      }
    }
  }
});

export default toggleMachine;
```

And voilà! My toggle works as expected. That was fun! When I was first learned XState back in 2022, I
built a similar toggle switch using XState v4 and React Native. v5 was released in December last year with some
breaking changes, so I took this opportunity to learn about it and document my experience.
