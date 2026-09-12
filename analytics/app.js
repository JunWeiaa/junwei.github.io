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
    locationCard: document.querySelector("#location-card"),
    locationCity: document.querySelector("#location-city"),
    locationRegion: document.querySelector("#location-region"),
    locationVisits: document.querySelector("#location-visits"),
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
    expandedCityKey: null,
    cityDetails: new Map(),
    cityRequest: null,
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
      .globeImageUrl("https://unpkg.com/three-globe@2.45.2/example/img/earth-blue-marble.jpg")
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
      .pointLabel(() => "")
      .ringLat("latitude")
      .ringLng("longitude")
      .ringColor(() => (time) => `rgba(85, 217, 255, ${Math.max(0, 1 - time)})`)
      .ringMaxRadius((city) => 1.6 + Math.log10(city.visits + 1) * 1.7)
      .ringPropagationSpeed(0.85)
      .ringRepeatPeriod((city) => Math.max(950, 2300 - Math.log10(city.visits + 1) * 420))
      .onPointHover(showLocation)
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

  function showLocation(city) {
    if (!city) {
      elements.locationCard.hidden = true;
      return;
    }

    const location = city.region && city.region !== "Unknown"
      ? `${city.region} · ${city.country}`
      : city.country;

    elements.locationCity.textContent = city.city;
    elements.locationRegion.textContent = location;
    elements.locationVisits.textContent = `${numberFormatter.format(city.visits)} 次浏览`;
    elements.locationCard.hidden = false;
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
    resetCityDetails();
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
      const cityKey = getCityKey(city);
      const isExpanded = state.expandedCityKey === cityKey;
      const button = document.createElement("button");
      const rank = document.createElement("span");
      const name = document.createElement("span");
      const cityName = document.createElement("strong");
      const locationName = document.createElement("span");
      const value = document.createElement("span");
      const chevron = document.createElement("span");
      const details = document.createElement("div");
      const location = city.region && city.region !== "Unknown"
        ? `${city.region} · ${city.country}`
        : city.country;

      item.className = "city-item";
      item.classList.toggle("is-expanded", isExpanded);
      button.type = "button";
      button.className = "city-trigger";
      button.setAttribute("aria-label", `${isExpanded ? "收起" : "展开"} ${city.city} 的访客明细`);
      button.setAttribute("aria-expanded", String(isExpanded));
      button.setAttribute("aria-controls", `city-details-${index}`);

      rank.className = "city-rank";
      rank.textContent = String(index + 1).padStart(2, "0");
      name.className = "city-name";
      cityName.textContent = city.city;
      locationName.textContent = location;
      name.append(cityName, locationName);
      value.className = "city-value";
      value.textContent = numberFormatter.format(city.visits);
      chevron.className = "city-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "⌄";
      button.append(rank, name, value, chevron);
      button.addEventListener("click", () => toggleCityDetails(city));

      details.className = "city-details";
      details.id = `city-details-${index}`;
      details.hidden = !isExpanded;

      if (isExpanded) {
        renderCityDetails(details, state.cityDetails.get(cityKey));
      }

      item.append(button, details);
      elements.cityList.append(item);
    }
  }

  function toggleCityDetails(city) {
    const cityKey = getCityKey(city);

    if (state.expandedCityKey === cityKey) {
      state.expandedCityKey = null;
      renderCityList();
      return;
    }

    state.expandedCityKey = cityKey;
    renderCityList();

    if (!state.cityDetails.has(cityKey)) {
      loadCityDetails(city, cityKey);
    }
  }

  async function loadCityDetails(city, cityKey) {
    state.cityRequest?.abort();
    state.cityRequest = new AbortController();
    state.cityDetails.set(cityKey, { status: "loading", visitors: [] });
    renderCityList();

    const query = new URLSearchParams({
      days: String(state.days),
      city: city.city,
      region: city.region,
      country: city.country,
    });

    try {
      const response = await fetch(`/analytics/city?${query}`, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: state.cityRequest.signal,
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || `访客明细请求失败（${response.status}）`);
      }

      const payload = await response.json();
      state.cityDetails.set(cityKey, {
        status: "ready",
        visitors: Array.isArray(payload.visitors) ? payload.visitors : [],
      });
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }

      state.cityDetails.set(cityKey, {
        status: "error",
        error: error.message || "暂时无法读取访客明细。",
        visitors: [],
      });
    } finally {
      if (state.expandedCityKey === cityKey) {
        renderCityList();
      }
    }
  }

  function renderCityDetails(container, detail) {
    if (!detail || detail.status === "loading") {
      const loading = document.createElement("p");
      loading.className = "city-detail-message";
      loading.textContent = "正在读取访客明细…";
      container.append(loading);
      return;
    }

    if (detail.status === "error") {
      const failure = document.createElement("p");
      failure.className = "city-detail-message is-error";
      failure.textContent = detail.error;
      container.append(failure);
      return;
    }

    if (detail.visitors.length === 0) {
      const empty = document.createElement("p");
      empty.className = "city-detail-message";
      empty.textContent = "暂无新版本采集的访客明细。";
      container.append(empty);
      return;
    }

    const list = document.createElement("ul");
    list.className = "visitor-list";

    for (const visitor of detail.visitors) {
      const row = document.createElement("li");
      const heading = document.createElement("div");
      const maskedIp = document.createElement("code");
      const visits = document.createElement("span");
      const identity = document.createElement("p");
      const organization = document.createElement("p");
      const badges = document.createElement("div");
      const networkBadge = document.createElement("span");
      const botBadge = document.createElement("span");
      const lastSeen = document.createElement("time");

      row.className = "visitor-row";
      heading.className = "visitor-heading";
      maskedIp.textContent = visitor.maskedIp || "Unknown";
      visits.textContent = `${numberFormatter.format(visitor.visits || 0)} 次`;
      heading.append(maskedIp, visits);

      identity.className = "visitor-identity";
      identity.textContent = `#${String(visitor.visitorId || "unknown").slice(0, 12)} · ${visitor.asn || "AS unknown"}`;
      organization.className = "visitor-organization";
      organization.textContent = visitor.organization || "Unknown";
      organization.title = visitor.organization || "Unknown";

      badges.className = "visitor-badges";
      networkBadge.className = "visitor-badge";
      networkBadge.textContent = visitor.networkType || "未知";
      botBadge.className = "visitor-badge visitor-bot-status";
      botBadge.classList.toggle(
        "is-suspected",
        visitor.botStatus === "疑似机器人" || visitor.botStatus === "已验证机器人",
      );
      botBadge.textContent = visitor.botStatus || "未知";
      badges.append(networkBadge, botBadge);

      lastSeen.className = "visitor-last-seen";
      lastSeen.textContent = formatLastSeen(visitor.lastSeen);
      if (visitor.lastSeen) {
        lastSeen.dateTime = visitor.lastSeen;
      }

      row.append(heading, identity, organization, badges, lastSeen);
      list.append(row);
    }

    const note = document.createElement("p");
    note.className = "city-detail-note";
    note.textContent = "网络类型与机器人标记为规则推测，仅供参考。";
    container.append(list, note);
  }

  function getCityKey(city) {
    return `${city.city}\u0000${city.region}\u0000${city.country}`;
  }

  function formatLastSeen(value) {
    const normalizedValue = typeof value === "string" && /^\d{4}-\d{2}-\d{2} /.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value;
    const date = new Date(normalizedValue);

    if (!value || Number.isNaN(date.getTime())) {
      return "访问时间未知";
    }

    return `最后访问 ${new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)}`;
  }

  function resetCityDetails() {
    state.cityRequest?.abort();
    state.cityRequest = null;
    state.expandedCityKey = null;
    state.cityDetails.clear();
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
