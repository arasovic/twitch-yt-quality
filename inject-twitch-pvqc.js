(function () {
  let active = true;
  const origVisState = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "visibilityState"
  );
  const origHidden = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "hidden"
  );
  const origHasFocus = document.hasFocus.bind(document);

  Object.defineProperty(document, "visibilityState", {
    get() {
      return active ? "visible" : origVisState.get.call(this);
    },
    configurable: true,
  });

  Object.defineProperty(document, "hidden", {
    get() {
      return active ? false : origHidden.get.call(this);
    },
    configurable: true,
  });

  document.hasFocus = function () {
    return active ? true : origHasFocus();
  };

  document.addEventListener(
    "visibilitychange",
    function (e) {
      if (active) e.stopImmediatePropagation();
    },
    true
  );

  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "aq_pvqc_toggle") {
      active = e.data.enabled;
    }
  });
})();
