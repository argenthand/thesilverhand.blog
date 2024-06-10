---
title: "Fetch using XState"
summary: "Building a reusable fetch hook using XState and Axios."
date: 2024-07-01
tags: [ "xstate", "react", "js" ]
published: true
---

Continuing my foray into learning XState, I want to build a re-usable fetch hook with support for cancelling
duplicate requests. Besides XState, I'm going to use [axios](https://axios-http.com) since its API has a few
niceties like automatic response handling, automatic request serialization, support for request/response data
transforms among many others. My requirement is simple: I want a hook that takes in some parameters for an HTTP
request, and returns the response, any errors, a loading indicator, and the ability to retry the request.

## Designing the hook's API

Before I implement the state machine, I want to set up the hook - specifically, what it returns. Also, since I'm
using axios, I can rely on its [config API](https://axios-http.com/docs/req_config) to accept a request object, so
in my machine I can pass it through to
an axios instance. I'm also going to define the `useMachine` hook here, so I can use it to design the machine. Here's
what that looks like:

```js
function useFetch(requestConfig, abortController = null) {
  let [state, send] = useMachine(fetchMachine, {
    input: {
      requestConfig,
      abortController: abortController ?? undefined
    }
  });
  let {response, error} = state.context;
  let isLoading = state.matches('fetching');

  return {response, error, isLoading, mutate: send({type: 'RETRY'})};
}
```

I'm working based on a few assumptions about my machine: it's going to have a state called `fetching`, it'll
accept an event called `RETRY`, and that it accepts the request config that's passed to the hook. I also want 
to be able to pass an [AbortController](https://mdn.io/abortcontroller) to my hook, in case I want to override 
the machine's request cancellation behaviour. Keeping these in mind, I'm going to implement the machine next. 
There are 2 concepts in XState that I'll mainly rely on to create my machine,
[promise actors](https://stately.ai/docs/promise-actors) and [the invoke property](https://stately.ai/docs/invoke).

```js
export default setup({
  actors: {
    callAxios: fromPromise(async ({input}) => {
      let response = await axios({...input.requestData, signal: input.abortController.signal});
      input.abortController.abort();
      return response;
    })
  }
}).createMachine({
  id: 'fetch-machine',
  context: ({input}) => ({
    abortController: input.abortController ?? new AbortController(),
    requestData: input.requestData,
    response: null,
    error: null
  }),
  initial: 'fetching',
  states: {
    'fetching': {
      invoke: {
        id: 'fetch-service',
        src: 'callAxios',
        input: ({context: {requestData, abortController}}) => ({requestData, abortController}),
        onDone: {
          target: 'success',
          actions: assign({response: ({event}) => event.output})
        },
        onError: {
          target: 'failure',
          actions: assign({
            error: ({event}) => ({
              status: event.error.status,
              code: event.error.code,
              message: event.error.message
            })
          }),
        }
      }
    },
    'success': {
      on: {
        'RETRY': {target: 'fetching'}
      }
    },
    'failure': {
      on: {
        'RETRY': {target: 'fetching'}
      }
    }
  }
});
```

The `fetching` state is the one I want to focus on. When the machine enters the `fetching` state, it invokes a 
promise actor called `callAxios`. I pass a request config object to the machine as input, which gets passed on to 
the `callAxios` actor, and `callAxios` in turn calls `axios` with that request object, returning the result. The 
great thing about axios is that it throws an error even where `fetch` doesn't, like when an API returns a 404 
response. Because of this behaviour, the promise actor will correctly handle 404 responses as errors without 
requiring any extra code. Another good thing is that promise actors in XState send `onDone` and `onError` events 
based on whether a promise resolves or rejects, and conveniently maps the responses and errors to separate 
variables called `output` and `error` respectively. This makes processing them super straightforward! I'm assigning 
them to the `response` and `error` context variables in the machine using `assign` actions. The `RETRY` event will 
handle any mutations I want to trigger.

Now that I have my machine and hook implemented, how do I use them? Let me show you an example. In the React 
component below, I'm using the PokeAPI to demonstrate usage of the hook.

```jsx
const ROOT_CONFIG = {
  method: "GET",
  baseURL: "https://pokeapi.co/api/v2/",
}

function App() {
  let {response: pikachuData, error: pikachuError, isLoading: isLoadingPikachu, mutate: mutatePikachu} = useFetch({
    ...ROOT_CONFIG,
    url: "pokemon/pikachu"
  }, new AbortController());
  let {
    response: bulbasaurData,
    error: bulbasaurError,
    isLoading: isLoadingBulbasaur,
    mutate: mutateBulbasaur
  } = useFetch({
    ...ROOT_CONFIG,
    url: "pokemon/bulbasaur"
  });

  return (
    <div>
      <details>
        <summary>Pikachu</summary>
        {isLoadingPikachu ? (
          <p>Loading pikachu data...</p>
        ) : null}
        {pikachuError ? (
          <div role="alert">
            {JSON.stringify(pikachuError, null, 2)}
            <button onClick={mutatePikachu}>RETRY</button>
          </div>
        ) : null}
        {pikachuData ? (<pre>{JSON.stringify(pikachuData, null, 2)}</pre>) : null}
      </details>
      <details>
        <summary>Bulbasaur</summary>
        {isLoadingBulbasaur ? (
          <p>Loading bulbasaur data...</p>
        ) : null}
        {bulbasaurError ? (
          <div role="alert">
            {JSON.stringify(bulbasaurError, null, 2)}
            <button onClick={mutateBulbasaur}>RETRY</button>
          </div>
        ) : null}
        {bulbasaurData ? (<pre>{JSON.stringify(bulbasaurData, null, 2)}</pre>) : null}
      </details>
    </div>
  )
}

export default App
```

Looks pretty clean, right? Even after all that, I've barely scratched the surface. There are so many ways to 
enhance this. I could implement background refresh using a delayed transition on the success/failure states, or add 
some pre/post processing of the request/response data, or flesh out the `isLoading` variable to distinguish between 
foreground and background fetches (React Query does this). The possibilities are endless!
