(function () {
  "use strict";

  const numberFormatter = new Intl.NumberFormat("zh-CN");
  const rangeLabels = {
    1: "最近 24 小时的页面浏览",
    7: "最近 7 天的页面浏览",
    30: "最近 30 天的页面浏览",
    90: "最近 90 天的页面浏览",
  };
  const elements = {
    globe: document.querySelector("#globe"),
    message: document.querySelector("#message"),
    totalVisits: document.querySelector("#total-visits"),
    cityCount: document.querySelector("#city-count"),
    countryCount: document.querySelector("#country-count"),
    cityList: document.querySelector("#city-list"),
    rangeDescription: document.querySelector("#range-description"),
    updatedAt: document.querySelector("#updated-at"),
    refreshButton: document.querySelector("#refresh-button"),
    rotationControl: document.querySelector("#rotation-control"),
    rangeButtons: Array.from(document.querySelectorAll("[data-days]")),
  };
  const state = {
    days: 7,
    globe: null,
    cities: [],
    rotating: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };

  function showMessage(text, type) {
    const paragraph = elements.message.querySelector("p");
    paragraph.textContent = text;
    elements.message.classList.add("is-visible");
    elements.message.classList.toggle("is-error", type === "error");
    elements.message.classList.toggle("is-empty", type === "empty");
  }

  function hideMessage() {
    elements.message.classList.remove("is-visible", "is-error", "is-empty");
  }

  function initializeGlobe() {
    if (typeof window.Globe !== "function") {
      throw new Error("3D 地球组件加载失败，请刷新页面重试。");
    }

    const globe = window.Globe()(elements.globe)
      .backgroundColor("rgba(0, 0, 0, 0)")
      .globeImageUrl("https://unpkg.com/three-globe@2.45.2/example/img/earth-night.jpg")
      .showAtmosphere(true)
      .atmosphereColor("#4fd4ff")
      .atmosphereAltitude(0.18)
      .showGraticules(true)
      .pointLat("latitude")
      .pointLng("longitude")
      .pointRadius(cityPointRadius)
      .pointAltitude(cityPointAltitude)
      .pointColor(cityPointColor)
      .pointResolution(10)
      .pointLabel(cityPointLabel)
      .ringLat("latitude")
      .ringLng("longitude")
      .ringColor(() => (time) => `rgba(85, 217, 255, ${Math.max(0, 1 - time)})`)
      .ringMaxRadius((city) => 1.6 + Math.log10(city.visits + 1) * 1.7)
      .ringPropagationSpeed(0.85)
      .ringRepeatPeriod((city) => Math.max(950, 2300 - Math.log10(city.visits + 1) * 420))
      .onPointClick(focusCity);

    const controls = globe.controls();
    controls.autoRotate = state.rotating;
    controls.autoRotateSpeed = 0.48;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 150;
    controls.maxDistance = 420;

    try {
      const material = globe.globeMaterial();
      material.color.set("#ffffff");
      material.emissive.set("#03101d");
      material.emissiveIntensity = 0.16;
      material.shininess = 0.45;
    } catch {
      // The globe still renders correctly if a future library version changes its material API.
    }

    state.globe = globe;
    updateRotationButton();
    resizeGlobe();

    const resizeObserver = new ResizeObserver(resizeGlobe);
    resizeObserver.observe(elements.globe);
  }

  function resizeGlobe() {
    if (!state.globe) {
      return;
    }

    state.globe
      .width(elements.globe.clientWidth)
      .height(elements.globe.clientHeight);
  }

  function cityPointRadius(city) {
    return Math.min(0.55, 0.12 + Math.log10(city.visits + 1) * 0.12);
  }

  function cityPointAltitude(city) {
    return Math.min(0.38, 0.035 + Math.log10(city.visits + 1) * 0.075);
  }

  function cityPointColor(city) {
    const maximum = state.cities[0]?.visits || 1;
    const ratio = city.visits / maximum;

    if (ratio >= 0.62) {
      return "#ffbd59";
    }

    if (ratio >= 0.22) {
      return "#55d9ff";
    }

    return "#3a86ff";
  }

  function cityPointLabel(city) {
    const location = city.region && city.region !== "Unknown"
      ? `${city.region}, ${city.country}`
      : city.country;

    return `
      <div class="globe-tooltip">
        <strong>${escapeHtml(city.city)}</strong><br>
        <span>${escapeHtml(location)} · ${numberFormatter.format(city.visits)} 次浏览</span>
      </div>`;
  }

  function focusCity(city) {
    if (!state.globe) {
      return;
    }

    state.globe.pointOfView(
      { lat: city.latitude, lng: city.longitude, altitude: 1.55 },
      850,
    );
  }

  async function loadData() {
    showMessage("正在读取城市访问数据…", "loading");
    setControlsDisabled(true);

    try {
      const response = await fetch(`/analytics/data?days=${state.days}`, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || `数据请求失败（${response.status}）`);
      }

      const payload = await response.json();
      state.cities = Array.isArray(payload.cities)
        ? payload.cities.slice().sort((left, right) => right.visits - left.visits)
        : [];

      renderData(payload.generatedAt);
    } catch (error) {
      showMessage(error.message || "暂时无法读取统计数据，请稍后重试。", "error");
    } finally {
      setControlsDisabled(false);
    }
  }

  function renderData(generatedAt) {
    const totalVisits = state.cities.reduce((sum, city) => sum + city.visits, 0);
    const countries = new Set(state.cities.map((city) => city.country));

    elements.totalVisits.textContent = numberFormatter.format(totalVisits);
    elements.cityCount.textContent = numberFormatter.format(state.cities.length);
    elements.countryCount.textContent = numberFormatter.format(countries.size);
    elements.rangeDescription.textContent = rangeLabels[state.days];
    elements.updatedAt.textContent = generatedAt
      ? `更新于 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(generatedAt))}`
      : "刚刚更新";

    renderCityList();

    if (state.globe) {
      state.globe.pointsData(state.cities);
      state.globe.ringsData(state.cities.slice(0, 24));
    }

    if (state.cities.length === 0) {
      showMessage("这个时间范围内还没有带城市坐标的访问数据。部署后产生的新访问会显示在这里。", "empty");
    } else {
      hideMessage();
    }
  }

  function renderCityList() {
    elements.cityList.replaceChildren();

    for (const [index, city] of state.cities.slice(0, 18).entries()) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const location = city.region && city.region !== "Unknown"
        ? `${city.region} · ${city.country}`
        : city.country;

      button.type = "button";
      button.setAttribute("aria-label", `查看 ${city.city}，${city.visits} 次浏览`);
      button.innerHTML = `
        <span class="city-rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="city-name">
          <strong>${escapeHtml(city.city)}</strong>
          <span>${escapeHtml(location)}</span>
        </span>
        <span class="city-value">${numberFormatter.format(city.visits)}</span>`;
      button.addEventListener("click", () => focusCity(city));
      item.append(button);
      elements.cityList.append(item);
    }
  }

  function setRange(days) {
    state.days = days;

    for (const button of elements.rangeButtons) {
      const isActive = Number(button.dataset.days) === days;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }

    loadData();
  }

  function toggleRotation() {
    state.rotating = !state.rotating;

    if (state.globe) {
      state.globe.controls().autoRotate = state.rotating;
    }

    updateRotationButton();
  }

  function updateRotationButton() {
    elements.rotationControl.textContent = state.rotating ? "暂停旋转" : "继续旋转";
    elements.rotationControl.setAttribute("aria-pressed", String(!state.rotating));
  }

  function setControlsDisabled(isDisabled) {
    elements.refreshButton.disabled = isDisabled;
    for (const button of elements.rangeButtons) {
      button.disabled = isDisabled;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  for (const button of elements.rangeButtons) {
    button.addEventListener("click", () => setRange(Number(button.dataset.days)));
  }

  elements.refreshButton.addEventListener("click", loadData);
  elements.rotationControl.addEventListener("click", toggleRotation);

  try {
    initializeGlobe();
    loadData();
  } catch (error) {
    showMessage(error.message || "3D 地球初始化失败。", "error");
  }
})();
