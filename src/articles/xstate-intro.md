---
title: Intro to XState
date: 2024-05-13
summary: "Learning the basics of XState by designing a stateful toggle switch."
tags: [ "react", "xstate" ]
published: true
---

Every CompSci student learns about [finite-state machines](https://en.wikipedia.org/wiki/Finite-state_machine) at some
point in their learning journey. I first learned about the concept back in university over a decade ago, but I only
recently learned about their practical uses to build React apps.

A couple of years ago, I came across [this talk](https://www.youtube.com/watch?v=HPoC-k7Rxwo) by David K. Piano, the
creator of XState. I had heard of XState before, but this talk solidified my understanding of the library.

## Example
### v1
I started with the simplest component I could think of: a checkbox - it can either be checked or unchecked. This 
way I can keep my focus on XState instead of business logic. I laid out the following requirements for my checkbox:

1. There should be a `<form>` on the page.
2. The form should have a single checkbox and a save button that writes the value somewhere (`localStorage` in this 
   case)
3. Whenever the page is loaded, the machine should use the saved value.

With these requirements in mind, I can now think about what my machine should do. I'm only dealing with 2 possible 
states: my checkbox can be checked or unchecked. From either state, I want to be able to transition to the opposite 
state. I also want to store the current state of the checkbox.

Here’s what I came up with:
```json
{
  "id": "toggle-machine",
  "context": {
    "toggleState": false
  },
  "initial": "turned-off",
  "states": {
    "turned-off": {
      "on": {
        "TOGGLE": {
          "target": "turned-on",
          "actions": ["logAction", "updateContext"]
        }
      }
    },
    "turned-on": {
      "on": {
        "TOGGLE": {
          "target": "turned-off",
          "actions": ["logAction", "updateContext"]
        }
      }
    }
  }
}
```

I'm using named actions in my machine definition at the moment, I'll provide the implementations below.

And here's the full machine:
```js
import {assign, setup} from 'xstate';

const toggleMachine = setup({
  actions: {
    logAction: ({context, event}) => {
      console.log(`${event.type} | ${context.toggleState}`);
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

The thing to note is the `context`. It holds any data that the machine needs. It's the same concept as the 
state in React's `useReducer` hook. Instead of always starting with false, I use the
[input](https://stately.ai/docs/input) parameter, so I can provide an initial value to the machine. I'll use this 
to restore a saved value for the checkbox later.

The `logAction` action logs the last event and context of the machine to the console. `updateContext` toggles the 
stored boolean value.

Now that I have the machine, I want to wire it up to my UI. I came up with a `ToggleSwitch` component that 
initializes the machine and sets up a form according to the requirements above. I also want to save the current 
state of the checkbox to `localStorage` every time the form is submitted.

Here's the component code:
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

function ToggleSwitch() {
  const savedState = restoreSavedToggleState();
  const [state, send] = useMachine(toggleMachine, {
    input: { savedState }
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

export default ToggleSwitch;
```

I love how clean it is! I didn't need any state variables, reducers, or effects. All the logic is handled by the 
state machine. I just need to send events to the machine.

And that’s that! I have a functioning form according to my requirements, and life is good…

### Performance Concerns
…Not quite. As feature complete as my toggle component is, there is a problem with its implementation. Any time I
toggle the checkbox, it re-triggers the `restoreSavedToggleState` function. The bottleneck isn't noticeable in this 
example since there's only one value, but reading from `localStorage` is an expensive operation, and I'd like to 
avoid triggering it every time the checkbox is toggled.

### v2
In v1 of my implementation, I initialize my machine with the `useMachine` hook from the `@xstate/react` package. But 
every time I interact with the checkbox, it re-renders the component which re-instantiates the machine and calls the
`restoreSavedToggleState`function since the machine re-calculates the context. I don't need to restore the saved value
unless I submit the form and update the saved value.

In v2 of my machine, I moved the restoring functionality into the machine itself and made it an entry action. Now 
whenever the machine gets initialized, it'll use a saved value if available, defaulting to false otherwise. This 
change means I no longer need to rely on the `input` parameter when defining the context object in my machine.

With that change, the machine becomes:
```js
import {assign, setup} from 'xstate';

const STORAGE_KEY = "toggleSwitch";

const toggleMachine = setup({
  actions: {
    logAction: ({context, event}) => {
      console.log(`${event.type} | ${context.toggleState}`);
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

I haven't solved the re-render issue yet. For that, I'll implement the `useActorRef` hook from `@xstate/react`. 
This hook returns a `ref` that points to the actor created from my machine, cutting down on unnecessary re-renders. 
The [documentation for `useActorRef`](https://stately.ai/docs/xstate-react#useactorrefmachine-options) do a great job
explaining it. The other difference from v1 is that because I'm using a `ref` to access the machine, I need to 
modify how I access the current value of the machine's context in the form submission handler. Finally, as a bonus, 
I implemented the `useSelector` hook, which returns the value I need from a snapshot of the machine, and it should 
only cause a re-render if selected value changes. It uses an optional comparer function to determine if the value 
has changed. It's overkill for my machine I'm only dealing with a single boolean, but it can be helpful if you have 
a complex machine with a complex context object. Just a bit of fun!

Here's the updated component code:
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

With that, the machine no longer re-renders every time I interact with my checkbox. Yay!

### One more thing
There's a small bug in the `logAction` action. I want that action to log `toggleState` every time I interact with 
the checkbox. It's logging a value as expected, but it's not the current state of the toggle. It's the previous 
value. In an XState state machine, the order in which the actions are defined matters. In my machine, the order of 
actions needs to be flipped. It should update the context first, then log it to the console.

Here's the final machine code:
```js
const STORAGE_KEY = "toggleSwitch";

const toggleMachine = setup({
  actions: {
    logAction: ({context, event}) => {
      console.log(`${event.type} | ${context.toggleState}`);
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

## Further Optimizations
There is one more thing I could do to make the machine drive the entire logic of my component. The 
`saveToggleState` function can be moved into the machine, along with the form submission. I'm 
going to leave this as an exercise to you if you're interested. I've barely scratched the surface of what XState 
can do. Over the past 2 years, I've built some pretty complex flows for React and React Native using XState v4. 
It's an insanely powerful tool, and my favourite library in the JavaScript ecosystem. I'd love to hear from you if 
you build something using XState!
