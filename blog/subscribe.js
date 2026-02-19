(function() {
  var BLOB = "https://jsonblob.com/api/jsonBlob/019c7722-2e7e-79a7-b01e-31fa882424b6";
  document.querySelectorAll(".subscribe-form").forEach(function(form) {
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      var input = form.querySelector("input[type=email]");
      var msg = form.nextElementSibling || form.parentElement.querySelector(".subscribe-msg");
      var email = input.value.trim();
      if (!email) return;
      var btn = form.querySelector("button");
      btn.disabled = true; btn.textContent = "...";
      fetch(BLOB).then(function(r) { return r.json(); }).then(function(subs) {
        if (subs.some(function(s) { return s.email === email; })) {
          if (msg) { msg.textContent = "You\u2019re already subscribed!"; msg.style.color = "var(--accent)"; }
          btn.textContent = "Subscribed \u2713"; return;
        }
        subs.push({ email: email, ts: new Date().toISOString(), page: location.pathname });
        return fetch(BLOB, {
          method: "PUT",
          body: JSON.stringify(subs),
          headers: { "Content-Type": "application/json" }
        });
      }).then(function(r) {
        if (r && r.ok) {
          if (msg) { msg.textContent = "You\u2019re in! \ud83d\udce8"; msg.style.color = "var(--accent)"; }
          input.value = ""; btn.textContent = "Subscribed \u2713";
        }
      }).catch(function() {
        if (msg) { msg.textContent = "Something went wrong \u2014 try again?"; msg.style.color = "#dc2626"; }
        btn.disabled = false; btn.textContent = "Subscribe";
      });
    });
  });
})();
