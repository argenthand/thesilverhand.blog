---
title: "FSM driven wizard forms"
summary: "Building a multistep user registration form with XState, React Hook Form, yup, and TypeScript."
date: "2024-07-08"
tags: [ "xstate", "react", "js" ]
published: true
---

Now that I'm a little more comfortable with XState, I want to try something really fun. I want to build a
multistep (wizard) user registration form with full client-side validation using
[React Hook Form](https://react-hook-form.com), [yup](https://github.com/jquense/yup), and
[TypeScript](https://typescriptlang.org). Of course, XState will still drive the core logic of the wizard. Let's
get started!

> You can follow along with the code using this GitHub
> repository: [xstate-wizard](https://github.com/argenthand/xstate-wizard).

## Requirements

The goal is to build as complete and usable a form as possible without going overboard. That said, here are the
requirements I laid out for this form:

1. The form should have two steps: one for account information and another for user information.
2. The form should have client-side validation for all fields.
   i. All fields are required.
   ii. The username should be unique, and the email should be valid.
   iii. The user must be at least 18 years old.
3. I should be able to navigate back and forth between steps.
4. Cancelling the form should reset all fields.
5. I should be able to provide default values to the form.
6. All the logic of the form including navigation and submission should be driven by XState.
7. Both the form and the machine should be fully typed.

That's a tall order, I'll go through it piece by piece.

## Designing the form

Now that I have the requirements, I'm ready to design the steps in the form. I'll start with account
information, where I want to capture the username and email. The username must be unique, and the email should be
valid. Yup will help us with these validations. Later on, I'll also implement username validation
server-side through XState.

### Account Information Form

The first thing I've done is to define the types for the form inputs and the validation schema for the form. This
is for React Hook Form and yup to use for validation. I have a common file for all types, called `types.d.ts`, and
the schemas are going to live in their own folder.

```ts
// types.d.ts
export type AccountInformationInputs = {
  username: string;
  email: string;
}
```

```ts
// schemas/account.ts
import * as yup from 'yup';

export const accountSchema = yup.object({
  username: yup.string().required().notOneOf(['thesilverhand'], 'Username is already taken.'),
  email: yup.string().email().required(),
});
```

For the form itself, I'm using React Hook Form to manage the form state and validation. Here's the form component:

```tsx
import {SubmitHandler, useForm} from "react-hook-form";
import {AccountInformationInputs} from "./types";
import {yupResolver} from "@hookform/resolvers/yup";
import {accountSchema} from "./schemas/account.ts";

function AccountInformation({saveAccountInfo, resetForm, defaultValues}: {
  saveAccountInfo: (data: AccountInformationInputs) => void;
  resetForm: () => void;
  defaultValues: AccountInformationInputs;
}) {
  const {
    register,
    handleSubmit,
    formState: {errors}
  } = useForm<AccountInformationInputs>({
    resolver: yupResolver(accountSchema),
    defaultValues
  });

  const onSubmit: SubmitHandler<AccountInformationInputs> = (data) => saveAccountInfo(data);
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <input placeholder="johndoe" {...register("username")} />
        {errors.username && <span>{errors.username?.message}</span>}
      </div>

      <div>
        <input placeholder="john.doe@example.com" type="email" {...register("email")} />
        {errors.email && <span>{errors.email?.message}</span>}
      </div>

      <div>
        <input type="submit" disabled={!!errors.email || !!errors.username} />
        <input type="button" value="Cancel" onClick={() => {
          resetForm();
        }} />
      </div>
    </form>
  );
}

export default AccountInformation;
```

A few things to note. I want the form's submit action to be controlled by the form container, so I'm passing the 
`saveAccountInfo` function as a prop. The actual saving will be handled by the state machine. The 
`resetForm` function will reset the form back to its initial state. I've also added the ability to pass initial 
values if I want to edit an existing account. The rest of the component is pretty standard React Hook Form usage.

### User Information Form

The user information form is similar to the account information form. I have the types and schema, along with the 
form component. Just like the account information form, the user information form will also be controlled by the 
state machine.

```ts
// types.d.ts
export type UserInformationInputs = {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
}
```

```ts
// schemas/user.ts
import * as yup from 'yup';

export const userSchema = yup.object({
  firstName: yup.string().required(),
  lastName: yup.string().required(),
  dateOfBirth: yup.date()
    .max(new Date(new Date().setFullYear(new Date().getFullYear() - 18)),
      'You must be at least 18 years old.').required(),
});
```

```tsx
import {SubmitHandler, useForm} from "react-hook-form";
import {UserInformationInputs} from "./types";
import {yupResolver} from "@hookform/resolvers/yup";
import {userSchema} from "./schemas/user.ts";

function UserInformation({saveUserInfo, goToAccountInfo, defaultValues}: {
  saveUserInfo: (data: UserInformationInputs) => void;
  goToAccountInfo: () => void;
  defaultValues: UserInformationInputs;
}) {
  const {
    register,
    handleSubmit,
    formState: {errors}
  } = useForm<UserInformationInputs>({
    resolver: yupResolver(userSchema),
    defaultValues
  });

  const onSubmit: SubmitHandler<UserInformationInputs> = (data) => saveUserInfo(data);
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <input placeholder="John" {...register("firstName")} />
        {errors.firstName && <span>{errors.firstName?.message}</span>}
      </div>

      <div>
        <input placeholder="Doe" {...register("lastName")} />
        {errors.lastName && <span>{errors.lastName?.message}</span>}
      </div>

      <div>
        <input placeholder="11/16/1993" type="date" {...register("dateOfBirth")} />
        {errors.dateOfBirth && <span>{errors.dateOfBirth?.message}</span>}
      </div>

      <div>
        <input type="submit" disabled={!!errors.firstName || !!errors.lastName || !!errors.dateOfBirth} />
        <input type="button" value="Back" onClick={goToAccountInfo} />
      </div>
    </form>
  );
}

export default UserInformation;
```

## Designing the machine

Now that I have the individual steps of the form, it's time to design the brains behind the wizard.

```ts
import {assign, fromPromise, setup} from "xstate";

export const formMachine = setup({
  types: {
    context: {} as {
      firstName: string,
      lastName: string,
      dateOfBirth: string,
      username: string,
      email: string,
    },
    input: {} as {
      firstName: string,
      lastName: string,
      dateOfBirth: string,
      username: string,
      email: string,
    },
    events: {} as
      | { type: 'START' }
      | { type: 'BACK' }
      | { type: 'RESET' }
      | {
      type: 'SAVE.USER', data: {
        firstName: string;
        lastName: string;
        dateOfBirth: string;
      }
    }
      | {
      type: 'SAVE.ACCOUNT', data: {
        username: string;
        email: string;
      }
    }
      | { type: 'RETRY' }
  },
  actions: {
    saveUserInfo: assign(({context, event}) => {
      if (event.type !== 'SAVE.USER') {
        return context;
      }
      return {
        ...context,
        firstName: event.data.firstName,
        lastName: event.data.lastName,
        dateOfBirth: event.data.dateOfBirth,
      };
    }),
    saveAccountInfo: assign(({context, event}) => {
      if (event.type !== 'SAVE.ACCOUNT') {
        return context;
      }
      return {
        ...context,
        username: event.data.username,
        email: event.data.email,
      }
    }),
    resetContext: assign(() => {
      return {
        firstName: '',
        lastName: '',
        dateOfBirth: '',
        email: '',
        username: ''
      }
    }),
    showErrorMessage: () => alert('An error occurred. Please try again.'),
  },
  actors: {
    submitUserAccountInfo: fromPromise(async ({input}) => {
      console.log('Submitting user account details', {...input});
      const randomBit = Math.floor(Math.random() * 2);
      return randomBit === 0 ? await Promise.reject() : await Promise.resolve();
    })
  }
}).createMachine({
  id: 'form-machine',
  initial: 'idle',
  context: {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    email: '',
    username: ''
  },
  states: {
    'idle': {
      on: {
        START: {
          target: 'capturing-account-info'
        }
      }
    },
    'capturing-user-info': {
      on: {
        'SAVE.USER': {
          actions: ['saveUserInfo'],
          target: 'submitting',
        },
        'BACK': {
          target: 'capturing-account-info'
        }
      }
    },
    'capturing-account-info': {
      on: {
        'SAVE.ACCOUNT': {
          actions: ['saveAccountInfo'],
          target: 'capturing-user-info'
        },
        'RESET': {
          target: 'idle',
          actions: ['resetContext']
        }
      }
    },
    'submitting': {
      invoke: {
        id: 'submitting-user-account-info',
        src: 'submitUserAccountInfo',
        input: ({context}) => ({...context}),
        onDone: {
          target: 'complete',
          actions: ['resetContext']
        },
        onError: {
          actions: ['showErrorMessage'],
          target: 'error'
        }
      }
    },
    'error': {
      on: {
        RETRY: {
          target: 'capturing-user-info'
        }
      }
    },
    'complete': {
      type: 'final'
    }
  }
});
```

The most important part of the machine is the `actors` property. I'm using a promise actor to simulate submitting 
the form. The `submitUserAccountInfo` actor will randomly resolve or reject the promise. This is to simulate errors 
during submission and test the error handling in the machine.

## Putting it all together

Now that I have all the individual pieces ready, I'm ready to wire everything up together. I'm going to use the 
`useActorRef` hook from `@xstate/react` to get a reference to the machine. I'll also create a couple of hooks to 
abstract the `useSelector` pattern to access the machine's states and context.

```ts
// types.d.ts
import {formMachine} from "./machine.ts";
import type {Actor, SnapshotFrom} from "xstate";

export type Snapshot = SnapshotFrom<typeof formMachine>;
export type FormMachineActor = Actor<typeof formMachine>;
```

```ts
// hooks/use.machine.context.ts
import {useSelector} from "@xstate/react";
import type {FormMachineActor, Snapshot} from "../types";

const selectFirstName = (snapshot: Snapshot) => snapshot.context.firstName;
const selectLastName = (snapshot: Snapshot) => snapshot.context.lastName;
const selectDateOfBirth = (snapshot: Snapshot) => snapshot.context.dateOfBirth;
const selectUsername = (snapshot: Snapshot) => snapshot.context.username;
const selectEmail = (snapshot: Snapshot) => snapshot.context.email;

export function useMachineContext(actorRef: FormMachineActor) {
  const firstName = useSelector(actorRef, selectFirstName);
  const lastName = useSelector(actorRef, selectLastName);
  const dateOfBirth = useSelector(actorRef, selectDateOfBirth);
  const username = useSelector(actorRef, selectUsername);
  const email = useSelector(actorRef, selectEmail);

  return {firstName, lastName, dateOfBirth, username, email};
}
```

```ts
// hooks/use.machine.state.ts
import {useSelector} from "@xstate/react";
import type {FormMachineActor, Snapshot} from "../types";

const idle = (snapshot: Snapshot) => snapshot.matches('idle');
const capturingUserInfo = (snapshot: Snapshot) => snapshot.matches('capturing-user-info');
const capturingAccountInfo = (snapshot: Snapshot) => snapshot.matches('capturing-account-info');
const complete = (snapshot: Snapshot) => snapshot.matches('complete');
const error = (snapshot: Snapshot) => snapshot.matches('error');
const submitting = (snapshot: Snapshot) => snapshot.matches('submitting');

export function useMachineState(actorRef: FormMachineActor) {
  const isIdle = useSelector(actorRef, idle);
  const isCapturingUserInfo = useSelector(actorRef, capturingUserInfo);
  const isCapturingAccountInfo = useSelector(actorRef, capturingAccountInfo);
  const isComplete = useSelector(actorRef, complete);
  const isError = useSelector(actorRef, error);
  const isSubmitting = useSelector(actorRef, submitting);

  return {isIdle, isCapturingUserInfo, isCapturingAccountInfo, isComplete, isError, isSubmitting};
}
```

{% raw %}

```tsx
import {useActorRef} from "@xstate/react";
import {formMachine} from "./machine.ts";
import UserInformation from "./user-information.tsx";
import AccountInformation from "./account-information.tsx";
import {AccountInformationInputs, UserInformationInputs} from "./types";
import {useMachineState} from "./hooks/use.machine.state.ts";
import {useMachineContext} from "./hooks/use.machine.context.ts";

function WizardForm() {
  const actorRef = useActorRef(formMachine);

  const {
    isIdle,
    isCapturingUserInfo,
    isCapturingAccountInfo,
    isComplete,
    isError,
    isSubmitting
  } = useMachineState(actorRef);
  const {
    firstName,
    lastName,
    dateOfBirth,
    username,
    email
  } = useMachineContext(actorRef);

  if (isIdle) {
    return <button onClick={() => actorRef.send({type: 'START'})}>Get Started</button>
  }

  if (isCapturingUserInfo) {
    return <UserInformation saveUserInfo={(data: UserInformationInputs) => {
      actorRef.send({
        type: 'SAVE.USER', data: {
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: data.dateOfBirth.toISOString().split('T')[0]
        }
      })
    }} goToAccountInfo={() => {
      actorRef.send({type: 'BACK'})
    }} defaultValues={{
      firstName,
      lastName,
      dateOfBirth: new Date(dateOfBirth)
    }} />
  }

  if (isCapturingAccountInfo) {
    return <AccountInformation saveAccountInfo={(data: AccountInformationInputs) => {
      actorRef.send({type: 'SAVE.ACCOUNT', data})
    }} resetForm={() => {
      actorRef.send({type: 'RESET'})
    }} defaultValues={{
      username,
      email
    }} />
  }

  if (isComplete) {
    return <h4>User details saved successfully!</h4>
  }

  if (isSubmitting) {
    return <h4>Submitting...</h4>
  }

  if (isError) {
    return <button onClick={() => actorRef.send({type: 'RETRY'})}>Retry</button>
  }
}

export default WizardForm;

```

{% endraw %}

I love how straightforward the wizard form code turned out. The machine drives the form, and the form components are 
rendered based on the machine's state. The machine's actions are triggered by the form components, and the form's 
validation schema ensures that we're only sending valid data to the machine. And the entire form is fully typed, 
thanks to TypeScript. How cool is that?

## Server-side validation

I mentioned earlier that I want to validate the username server-side. I'm going to use XState's `invoke` property 
on the `capturing-account-info` state to send the username to the server for validation. The updated machine code 
is below. Note that I've removed all the existing machine code I've previously covered for brevity.

```ts
// machine.ts

export const formMachine = setup({
   types: {
      // existing code...
   },
   actions: {
      // existing code...
      showUsernameError: () => alert('Username is already taken. Please try a different username.'),
   },
   actors: {
      // existing code...
      checkUsernameAvailability: fromPromise(async ({input}: { input: { username: string; } }) => {
         console.log('Checking username availability', input.username);
         if (input.username.toLowerCase() === 'thesilverhand') {
            return await Promise.reject();
         }
         return await Promise.resolve();
      }),
   }
}).createMachine({
   id: 'form-machine',
   initial: 'idle',
   context: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      email: '',
      username: ''
   },
   states: {
      // existing code...
      'capturing-account-info': {
         on: {
            'SAVE.ACCOUNT': {
               actions: ['saveAccountInfo'],
               target: 'checking-username-availability'
            },
            'RESET': {
               target: 'idle',
               actions: ['resetContext']
            }
         }
      },
      'checking-username-availability': {
         invoke: {
            id: 'checking-username-availability',
            src: 'checkUsernameAvailability',
            input: ({context}) => ({username: context.username}),
            onDone: {
               target: 'capturing-user-info'
            },
            onError: {
               actions: ['showUsernameError'],
               target: 'capturing-account-info'
            }
         }
      },
      // existing code...
   }
})

```

The main idea is to add a new state that invokes a promise actor with the username value provided to the machine. 
The machine will only transition to the next state if the promise resolves and the username is available. Otherwise,
it'll stay in the same state and show an error message. This is a simple example, but the possibilities are endless.
For instance, I could implement analytics tracking, keep a local record of all the usernames checked in the current 
session to avoid unnecessary requests, or even implement a username suggestion engine.

And that's it! This was the most fun I've had building a form in a long time. The more I use XState, the more I 
realize it's versatility. I hope you enjoyed reading this article as much as I enjoyed putting it together.
