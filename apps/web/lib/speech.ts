"use client";

import { useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

// the browser's own speech recognition (free; Chrome and Edge, and Chrome on Android). TypeScript's DOM types don't
// carry it, so just the parts used here
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  // the mic is open and sound is coming in: speaking now is heard
  onaudiostart: (() => void) | null;
};
type RecognitionClass = new () => Recognition;

const recognitionClass = (): RecognitionClass | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

// the app's language as the recogniser knows it
const SPEECH_LANG: Record<string, string> = { en: "en-IN", hi: "hi-IN", kn: "kn-IN" };

// how long a quiet spell ends listening that waits for more (a number said in parts), and how long it waits for the
// first word
const QUIET_MS = 2500;
const FIRST_WORD_MS = 8000;

// what went wrong, as the recogniser says it: the mic blocked, no connection to the speech service (Chrome sends
// the audio to Google), no mic found, nothing heard, or something else
// "starting" is the second or so Chrome takes to connect and open the mic; "listening" is once it has
export type SpeechState = "idle" | "starting" | "listening" | "denied" | "network" | "noMic" | "silent" | "error";

const STATE_OF: Record<string, SpeechState> = {
  "not-allowed": "denied",
  "service-not-allowed": "denied",
  network: "network",
  "audio-capture": "noMic",
  "no-speech": "silent",
  aborted: "idle",
};

// how to listen: `until` keeps listening through pauses (a phone said in parts) and stops once what's heard is
// enough; `throughPauses` keeps listening until a quiet spell (an amount said in parts); without either, listening
// ends at the first pause
export type SpeechOptions = { until?: (heard: string) => boolean; throughPauses?: boolean };

// one thing said at a time, in the app's language: `listen` starts, the words come to `onText` when listening ends
// (and as they're said, to `heard`), and `stop` ends it early. `supported` is false where the browser has no
// recogniser (the mic button then doesn't show)
export function useSpeech(onText: (text: string) => void, options: SpeechOptions = {}) {
  const locale = useLocale();
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<SpeechState>("idle");
  const [heard, setHeard] = useState("");
  const current = useRef<Recognition | null>(null);
  const quiet = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deliver = useRef(onText);
  deliver.current = onText;
  const until = useRef(options.until);
  until.current = options.until;
  const throughPauses = useRef(!!options.throughPauses);
  throughPauses.current = !!options.throughPauses;

  // only known in the browser
  useEffect(() => {
    setSupported(recognitionClass() !== null);
  }, []);

  // nothing keeps listening once the field is gone
  useEffect(
    () => () => {
      current.current?.abort();
      if (quiet.current) clearTimeout(quiet.current);
    },
    [],
  );

  const listen = useCallback(() => {
    const Class = recognitionClass();
    if (!Class) return;
    current.current?.abort();
    const r = new Class();
    const waits = !!until.current || throughPauses.current;
    r.lang = SPEECH_LANG[locale] ?? "en-IN";
    r.interimResults = true;
    r.continuous = waits;
    r.maxAlternatives = 1;
    // everything heard so far (finished stretches and the one still being said)
    let latest = "";
    let finished = false;

    // done listening: what was heard goes to the field, once, and Chrome is let go of. Ours to call, not Chrome's: asked
    // to stop, Chrome can hold on for many seconds before it ends by itself
    const finish = () => {
      if (finished) return;
      finished = true;
      if (quiet.current) clearTimeout(quiet.current);
      current.current = null;
      setHeard("");
      setState((s) => (s === "listening" || s === "starting" ? "idle" : s));
      const text = latest.trim();
      if (text) {
        // what Chrome heard, for telling why a word came out wrong
        console.info("[speech heard]", text);
        deliver.current(text);
      }
      try {
        r.abort();
      } catch {
        // already ended
      }
    };

    // waiting for more: a quiet spell ends it (longer before the first word, so there's time to start)
    const hush = (ms = QUIET_MS) => {
      if (!waits) return;
      if (quiet.current) clearTimeout(quiet.current);
      quiet.current = setTimeout(finish, ms);
    };

    // every stretch Chrome has finished, kept in order: after a pause some Chrome builds send only the new stretch,
    // so finished ones are added as they come (each once, from the event's resultIndex), never rebuilt from the list
    const done: string[] = [];
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        const words = result[0]!.transcript.trim();
        if (result.isFinal) {
          if (words) done.push(words);
        } else interim += ` ${words}`;
      }
      const all = `${done.join(" ")} ${interim}`.trim();
      latest = all;
      console.debug("[speech] so far:", all);
      setHeard(all);
      // enough heard: done now (what's heard so far counts)
      if (until.current?.(all)) finish();
      else hush();
    };
    r.onerror = (e) => {
      // our own abort, after finishing, isn't a problem
      if (finished && e.error === "aborted") return;
      // kept in the console too, to tell what a browser does
      console.warn("[speech]", e.error);
      setState(STATE_OF[e.error] ?? "error");
    };
    // Chrome ending by itself (a pause, when not waiting for more) finishes it too
    r.onend = finish;
    // listening only once Chrome's mic is really open (the wait before it is shown as "getting ready")
    r.onaudiostart = () => {
      setState((s) => (s === "starting" ? "listening" : s));
      hush(FIRST_WORD_MS);
    };
    current.current = r;
    setHeard("");
    setState("starting");
    try {
      r.start();
    } catch (e) {
      console.warn("[speech] start", e);
      current.current = null;
      setState("error");
      return;
    }
    hush(FIRST_WORD_MS);
  }, [locale]);

  const stop = useCallback(() => current.current?.stop(), []);

  return { supported, state, heard, listen, stop };
}
