import { useState, useEffect } from 'react';

interface TypewriterOptions {
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
}

export function useTypewriter(
  phrases: string[],
  { typingSpeed = 70, deletingSpeed = 38, pauseDuration = 1800 }: TypewriterOptions = {}
): string {
  const [displayText, setDisplayText] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timer: number;
    const currentPhrase = phrases[phraseIndex % phrases.length];

    if (!isDeleting) {
      if (displayText.length < currentPhrase.length) {
        timer = window.setTimeout(() => {
          setDisplayText(currentPhrase.substring(0, displayText.length + 1));
        }, typingSpeed);
      } else {
        timer = window.setTimeout(() => {
          setIsDeleting(true);
        }, pauseDuration);
      }
    } else {
      if (displayText.length > 0) {
        timer = window.setTimeout(() => {
          setDisplayText(currentPhrase.substring(0, displayText.length - 1));
        }, deletingSpeed);
      } else {
        setIsDeleting(false);
        setPhraseIndex(prev => (prev + 1) % phrases.length);
      }
    }

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, phraseIndex, phrases, typingSpeed, deletingSpeed, pauseDuration]);

  return displayText;
}
