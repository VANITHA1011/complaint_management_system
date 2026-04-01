// Auto-Seeder script for CIVIX Database Demonstration
document.addEventListener('DOMContentLoaded', () => {
    const KEY = 'complaints';
    
    // Only run this seeder ONCE automatically, or if forced
    if (localStorage.getItem('civix_seeded_v4')) return;
    
    const now = Date.now();
    const hourMs = 3600000;
    
    // Helper to generate realistic timestamp spread
    function makeDummy(id, title, category, priority, status, level, hoursAgo) {
        const createTime = now - (hoursAgo * hourMs);
        let currLevelStart = createTime;
        if (level === 2) currLevelStart = now - (hoursAgo/2 * hourMs);
        if (level >= 3) currLevelStart = now - (hoursAgo/4 * hourMs);

        return {
            id: id,
            title: title,
            category: category,
            priority: priority,
            status: status,
            currentLevel: level,
            level: level,
            createdAt: createTime,
            levelStartedAt: currLevelStart, 
            escalationLog: [],
            escalationCount: level - 1,
            isEditable: (status !== 'Resolved')
        };
    }
    
    let existing = JSON.parse(localStorage.getItem(KEY)) || [];
    
    // Generate high-quality test data matching real-world scenarios
    const seedData = [
        // 🟢 WARD LEVEL (L1) 
        makeDummy('CMP012', 'Streetlight flickering and throwing sparks', 'electricity', 'high', 'Pending', 1, 0.2), // 12 mins ago
        makeDummy('CMP014', 'Clogged drainage near bus stop', 'sanitation', 'medium', 'In Progress', 1, 0.4), // 24 mins ago
        makeDummy('CMP023', 'Fallen tree branch blocking sidewalk', 'roads', 'low', 'Pending', 1, 0.5),// 30 mins ago
        
        // 🟡 MUNICIPALITY LEVEL (L2) - Auto-escalated from Ward
        makeDummy('CMP041', 'Dead animal on main market road', 'sanitation', 'high', 'Pending', 2, 2.5), 
        makeDummy('CMP045', 'Massive pothole causing severe traffic jams', 'roads', 'high', 'In Progress', 2, 4.0),
        
        // 🔵 DISTRICT LEVEL (L3) - Long pending
        makeDummy('CMP088', 'Contaminated yellow water from community taps', 'water', 'high', 'Pending', 3, 48),
        makeDummy('CMP090', 'Public hospital generator failure', 'electricity', 'high', 'Pending', 3, 56),

        // 🔴 STATE LEVEL (L4) - Critical failures
        makeDummy('CMP101', 'Highway bridge structural cracks reporting', 'infrastructure', 'high', 'Pending', 4, 120),
        makeDummy('CMP115', 'Toxic chemical waste dumped in local river', 'sanitation', 'high', 'Pending', 4, 150)
    ];
    
    // Inject logic trails into logs so the "View Details" Brain Module looks amazing
    seedData.forEach(c => {
        // Build a fake history to make "View Details" look highly active
        if (c.level >= 2) {
            c.escalationLog.push({ action: 'Auto-Escalated (SLA Breach)', by: 'System', from: 1, to: 2, time: new Date(c.createdAt + hourMs).toISOString() });
        }
        if (c.level >= 3) {
            c.escalationLog.push({ action: 'Escalated by Officer', by: 'Municipality Officer', from: 2, to: 3, reason: 'Beyond municipality scope', time: new Date(c.createdAt + hourMs*24).toISOString() });
        }
        if (c.level >= 4) {
            c.escalationLog.push({ action: 'Auto-Escalated (SLA Breach) - Critical', by: 'System', from: 3, to: 4, time: new Date(c.createdAt + hourMs*72).toISOString() });
            c.escalationLog.push({ action: 'Assigned to Special Task Force', by: 'State Authority', level: 4, time: new Date().toISOString() });
            c.departmentAssigned = "Special Task Force";
        }
        if (c.status === 'In Progress') {
             c.escalationLog.push({ action: 'Started Process', by: c.level === 1 ? 'Ward Officer' : 'Municipality Officer', level: c.level, time: new Date().toISOString() });
        }
    });
    
    // Only add seeds that don't already share an ID
    seedData.forEach(seed => {
        if (!existing.find(x => x.id === seed.id)) {
            existing.unshift(seed);
        }
    });

    localStorage.setItem(KEY, JSON.stringify(existing));
    localStorage.setItem('civix_seeded_v4', 'DONE');
    
    console.log("CIVIX v3 Seed Data successfully injected!");
    
    // Optionally trigger a table re-render if the page is currently on a dashboard
    if (typeof renderTable === 'function') {
        setTimeout(renderTable, 500); 
    }
});
