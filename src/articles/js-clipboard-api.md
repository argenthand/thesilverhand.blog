---
title: "Custom clipboard behaviour in React"
published: true
date: 2024-06-10
summary: "Learning how to leverage the Clipboard API to override the default copy behaviour in a React app."
tags: ["react", "js"]
---

Recently I worked on an interesting bug in a React app. We had a table that would highlight rows when you select them.
The problem was when you tried to copy some text from a column in the table, it would copy the highlight styling as
part of the text. This was not ideal, as you’d paste colourful text when you just want plaintext. All major OSes and
word processors allow you to paste text without any formatting, but that’s an extra step for the end-user that we
wanted to avoid.

In my research for a solution, I learned about the Clipboard API in JavaScript. My first attempt was straightforward. I
needed to apply this behaviour across the entire app, so I intercepted the browser’s “copy” event in my app’s entry
point with a `useEffect` hook (the actual component was class based, so I needed to use the class lifecycle
methods `componentDidMount` and `componentWillUnmount`, but the idea remains the same in functional components).

```jsx
function App() {
    // existing code
    useEffect(() => {
        document.addEventListener("copy", (event) => {
            const selection = document.getSelection();
            event.clipboardData.setData(
                "text/plain",
                selection.toString().trim()
            );
            event.preventDefault();
        });

        // cleanup function
        return () => document.removeEventListener("copy", () => {
        });
    }, [])
}
```

I ran some initial tests, and the text seemed to get copied and pasted without any fancy formatting or highlighting.
Success! However, there was another problem. If the column contained a link, the hyperlink behind the text was also
getting stripped out, which isn’t what I wanted. I needed a way to detect if the copied text contained a link, and skip
the stripping logic in that case.

The [`document.getSelection()`](https://developer.mozilla.org/en-US/docs/Web/API/Document/getSelection) function
returns a `Selection` object containing information about the selected text and the corresponding HTML node. Using
that, I check if the parent element of the selected text is an `a` tag, and only override the clipboard if it isn’t.
Here’s that implementation.

```jsx
function App() {
    // existing code
    useEffect(() => {
        document.addEventListener("copy", (event) => {
            const selection = document.getSelection();
            if (selection.focusNode.parentElement.localName !== "a") {
                event.clipboardData.setData(
                    "text/plain",
                    selection.toString().trim()
                );
                event.preventDefault();
            }
        });

        // cleanup function
        return () => document.removeEventListener("copy", () => {
        });
    }, [])
}
```

There might be a better way to check for specific tags, but this approach worked for my use case. No more quirky
highlighting issues! This was my first time interacting with the clipboard API, and it was a fun experience learning
about its ins and outs!
