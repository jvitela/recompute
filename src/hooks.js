import { useRef, useEffect } from "react";
import { useSelector } from "react-redux";

let refsCount = 0;

const addRef = selector => {
  if (!selector.refIds) {
    selector.refIds = [];
  }
  selector.refIds.push(++refsCount);
  return refsCount;
};

const removeRef = (selector, refId) => {
  if (!selector.refIds) {
    return;
  }
  selector.refIds = selector.refIds.filter(id => id !== refId);
  if (selector.refIds.length === 0) {
    // console.log("clearing cache");
    selector.clearCache();
  }
};

/**
 * Wrapper around useSelector that keeps reference count per component instance
 *  in order to automatically clear the cache when all components using
 *  the selector are unmounted.
 * 
 * @param Function selector 
 * @param  {...any} args 
 */
export const useComputation = (selector, ...args) => {
  const ref = useRef();

  if (!ref.current) {
    ref.current = addRef(selector);
  }

  useEffect(() => {
    const refId = ref.current;
    return () => removeRef(selector, refId);
  }, [selector]);

  const result = useSelector(state => {
    return selector.withState(state).apply(null, args);
  });

//   console.log(`Recomputations: ${selector.recomputations()}`);
  return result;
};
