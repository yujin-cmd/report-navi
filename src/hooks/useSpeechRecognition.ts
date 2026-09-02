import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechAlternativeLike { transcript: string }
interface SpeechResultLike { isFinal: boolean; 0: SpeechAlternativeLike; length: number }
interface SpeechEventLike { resultIndex: number; results: ArrayLike<SpeechResultLike> }
interface SpeechErrorLike { error: string }

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechErrorLike) => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

export function useSpeechRecognition(onFinalTranscript: (text: string) => void) {
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const keepAliveRef = useRef(false);
  const callbackRef = useRef(onFinalTranscript);
  const restartTimerRef = useRef<number>();
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState('');
  const constructor = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
  const supported = Boolean(constructor);

  useEffect(() => {
    callbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const createRecognition = useCallback(() => {
    if (!constructor) return null;
    const recognition = new constructor();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) final += `${result[0].transcript} `;
        else interim += `${result[0].transcript} `;
      }
      setInterimTranscript(interim.trim());
      if (final.trim()) callbackRef.current(final.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(event.error === 'not-allowed' ? '마이크 권한이 거부되었습니다. 아래 텍스트 입력으로 시연할 수 있습니다.' : '음성 인식 연결이 잠시 중단되었습니다.');
      }
    };
    recognition.onend = () => {
      if (!keepAliveRef.current) {
        setIsListening(false);
        return;
      }
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = window.setTimeout(() => {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
        }
      }, 260);
    };
    return recognition;
  }, [constructor]);

  const start = useCallback(() => {
    if (!supported) return;
    setError('');
    keepAliveRef.current = true;
    const recognition = recognitionRef.current || createRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setError('음성 인식을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    }
  }, [createRecognition, supported]);

  const stop = useCallback(() => {
    keepAliveRef.current = false;
    window.clearTimeout(restartTimerRef.current);
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  useEffect(() => () => {
    keepAliveRef.current = false;
    window.clearTimeout(restartTimerRef.current);
    recognitionRef.current?.stop();
  }, []);

  return { supported, isListening, interimTranscript, error, start, stop };
}
