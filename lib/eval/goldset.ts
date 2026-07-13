// The gold / reference dataset the eval harness grades against. Each item pairs
// a question with two hand-labeled sets:
//   - keyPoints:  correct facts a strong answer should contain (positive class)
//   - distractors: plausible-but-wrong claims a good answer must avoid (negatives)
// Keep facts uncontroversial and version-stable so scores stay comparable across
// runs. Add items freely; the harness iterates whatever is exported here.

import { GoldItem } from "@/types/eval";

export const GOLD_SET: GoldItem[] = [
  {
    id: "react-vdom",
    topic: "React",
    difficulty: "mid",
    question: "Explain how React's virtual DOM and reconciliation work.",
    keyPoints: [
      "React maintains a lightweight in-memory representation of the UI (the virtual DOM).",
      "On a state change it builds a new virtual tree and diffs it against the previous one (reconciliation).",
      "Only the minimal set of real DOM mutations needed to match the new tree is applied.",
      "Keys let React match elements across renders when reconciling lists.",
    ],
    distractors: [
      "The virtual DOM is inherently faster than the real DOM at painting pixels to the screen.",
      "React replaces the entire real DOM on every state change.",
      "Using the virtual DOM removes the need for the browser to reflow or repaint.",
    ],
  },
  {
    id: "react-useeffect",
    topic: "React",
    difficulty: "junior",
    question: "What does the useEffect hook do and how does its dependency array work?",
    keyPoints: [
      "useEffect runs side effects after the component renders.",
      "The dependency array controls when the effect re-runs — it runs when a listed value changes.",
      "Returning a function from the effect provides cleanup that runs before the next effect or on unmount.",
      "An empty dependency array runs the effect once after the initial mount.",
    ],
    distractors: [
      "By default useEffect runs synchronously before the browser paints.",
      "Omitting the dependency array makes the effect run only once.",
      "useEffect can be called conditionally inside an if statement.",
    ],
  },
  {
    id: "ts-unknown-any",
    topic: "TypeScript",
    difficulty: "mid",
    question: "What is the difference between the `unknown` and `any` types in TypeScript?",
    keyPoints: [
      "`any` opts out of type checking; `unknown` is the type-safe counterpart.",
      "You must narrow an `unknown` value (e.g. with a typeof/instanceof check) before operating on it.",
      "`unknown` is assignable from any value but is not assignable to other types without narrowing.",
    ],
    distractors: [
      "`unknown` and `any` behave identically at both compile time and runtime.",
      "You can call methods on an `unknown` value directly without narrowing it first.",
      "`any` is stricter and therefore safer than `unknown`.",
    ],
  },
  {
    id: "js-event-loop",
    topic: "JavaScript",
    difficulty: "mid",
    question: "Describe the JavaScript event loop and the difference between microtasks and macrotasks.",
    keyPoints: [
      "JavaScript runs on a single thread driven by an event loop.",
      "The current task must run to completion and clear the call stack before the next task is picked up.",
      "Microtasks (e.g. promise callbacks) run before the next macrotask (e.g. setTimeout).",
      "The microtask queue is drained fully after each task before rendering or the next macrotask.",
    ],
    distractors: [
      "A setTimeout(fn, 0) callback runs before an already-resolved promise's .then callback.",
      "Promises execute their callbacks on a separate background thread.",
      "Using async/await makes the awaited operations run in parallel.",
    ],
  },
  {
    id: "css-flex-grid",
    topic: "CSS",
    difficulty: "junior",
    question: "When would you use CSS Flexbox versus CSS Grid?",
    keyPoints: [
      "Flexbox is designed for one-dimensional layout — a single row or column.",
      "Grid is designed for two-dimensional layout — rows and columns together.",
      "Grid uses grid-template-columns/grid-template-rows to define explicit tracks.",
      "Flexbox aligns and distributes items along its main and cross axes (justify-content / align-items).",
    ],
    distractors: [
      "Flexbox lays out rows and columns simultaneously in two dimensions, just like Grid.",
      "CSS Grid only works in legacy browsers and is unsupported in modern ones.",
      "float is the recommended modern layout technique over Flexbox and Grid.",
    ],
  },
  {
    id: "next-server-components",
    topic: "Next.js",
    difficulty: "senior",
    question: "In the Next.js App Router, what is the difference between Server Components and Client Components?",
    keyPoints: [
      "Server Components render on the server and ship no component JavaScript to the client.",
      "Client Components are opted in with the \"use client\" directive and can use state, effects, and browser APIs.",
      "Server Components cannot use client hooks like useState or useEffect.",
      "You can pass serializable props from a Server Component down into a Client Component.",
    ],
    distractors: [
      "Every component in the App Router is a Client Component by default.",
      "A Server Component can use useState as long as it imports it from React.",
      "The \"use client\" directive must be added to every file under the app directory.",
    ],
  },
  {
    id: "sysdesign-debounce-throttle",
    topic: "System Design",
    difficulty: "senior",
    question: "What is the difference between debouncing and throttling, and when would you use each on the frontend?",
    keyPoints: [
      "Debouncing delays running the handler until a pause in events — it fires only after activity stops for a set delay.",
      "Throttling limits the handler to run at most once per fixed interval while events keep firing.",
      "Debounce suits search-as-you-type inputs; throttle suits high-frequency events like scroll or resize.",
      "Both reduce how often an expensive handler runs in response to rapid events.",
    ],
    distractors: [
      "Debouncing and throttling are just two names for the same technique.",
      "Throttling waits until the user stops interacting and then fires the handler exactly once.",
      "Debouncing guarantees the handler runs on every single event.",
    ],
  },
];

/** Look up a gold item by id. */
export function getGoldItem(id: string): GoldItem | undefined {
  return GOLD_SET.find((item) => item.id === id);
}
