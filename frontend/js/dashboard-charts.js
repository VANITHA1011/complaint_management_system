/**
 * CIVIX Dashboard Charts Utility
 * Handles initialization of Resolution Velocity and Status Distribution charts.
 */

function initDashboardCharts(velocityCanvasId, statusCanvasId, levelData) {
    const velocityCtx = document.getElementById(velocityCanvasId);
    const statusCtx = document.getElementById(statusCanvasId);

    if (!velocityCtx || !statusCtx) {
        console.warn("Chart canvases not found:", { velocityCanvasId, statusCanvasId });
        return;
    }

    // Default palette for CIVIX
    const colors = {
        primary: '#3b82f6',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#0ea5e9',
        gray: '#94a3b8'
    };

    // 1. Resolution Velocity Chart (Line/Bar showing trend)
    new Chart(velocityCtx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Avg. Resolution Time (min)',
                data: [45, 38, 52, 30, 25, 40, 35],
                borderColor: colors.primary,
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: colors.primary,
                pointBorderColor: '#fff',
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { 
                    backgroundColor: '#1e293b',
                    padding: 12,
                    cornerRadius: 8
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: false } }
            }
        }
    });

    // 2. Status Distribution Chart (Doughnut)
    new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: ['Resolved', 'Pending', 'Escalated'],
            datasets: [{
                data: [65, 20, 15],
                backgroundColor: [colors.success, colors.warning, colors.danger],
                hoverOffset: 4,
                borderWidth: 0,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { family: 'Segoe UI', size: 12 }
                    }
                }
            }
        }
    });
}
