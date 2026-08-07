<template>
  <div class="workshop-list">
    <div class="workshop-list__header">
      <span class="workshop-list__title">工坊</span>
    </div>
    <div class="workshop-list__placeholder">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
      <p>暂无可用工坊</p>
    </div>
  </div>
</template>

<style scoped>
.workshop-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.workshop-list__header {
  padding: 14px 16px 10px;
  flex-shrink: 0;
}
.workshop-list__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sa-text-secondary, #86868b);
  letter-spacing: 0.5px;
}
.workshop-list__placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--sa-text-tertiary, #aeaeb2);
  font-size: 13px;
  padding: 20px;
}
</style>
