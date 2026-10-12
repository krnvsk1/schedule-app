(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Journals = api;
})(typeof self !== 'undefined' ? self : this, function () {
    // Правка отправленной записи = новая версия с причиной. Старая остаётся.
    var EDIT_POLICY = 'version';
    var FRYER_RETAIN_MS = 90 * 24 * 60 * 60 * 1000;

    var TEMPLATES = [
        { code: 'J1', title: 'Гигиенический журнал', layer: 'sanpin', frequency: 'Перед сменой', obligation: 'always', blurb: 'Допуск сотрудников к работе. Журнал СанПиН.' },
        { code: 'J2', title: 'Температура холодильников', layer: 'sanpin', frequency: 'Каждый замер смены', obligation: 'always', blurb: 'Холодильное и морозильное оборудование. Журнал СанПиН.' },
        { code: 'J3', title: 'Температура и влажность склада', layer: 'sanpin', frequency: 'Ежедневно по зонам', obligation: 'if_feature', feature: 'has_warehouse', blurb: 'Складские зоны. Журнал СанПиН, если есть склад.' },
        { code: 'J4', title: 'Фритюрные жиры', layer: 'sanpin', frequency: 'В дни жарки', obligation: 'if_feature', feature: 'has_fryer', blurb: 'Учёт фритюра. Журнал СанПиН, если есть фритюр. Записи хранятся не меньше 90 дней.' },
        { code: 'J5', title: 'Бракераж готовой продукции', layer: 'sanpin', frequency: 'Каждая партия', obligation: 'if_feature', feature: ['med_social_catering', 'has_batch_service'], blurb: 'Оценка готовых блюд перед раздачей. Журнал СанПиН для мед/соцпитания и партийной раздачи.' },
        { code: 'J6', title: 'Бракераж скоропортящейся при приёмке', layer: 'sanpin', frequency: 'Каждая партия', obligation: 'if_feature', feature: 'med_social_catering', blurb: 'Приёмка скоропорта. Журнал СанПиН для мед/соцпитания.' },
        { code: 'H1', title: 'Входной контроль сырья', layer: 'haccp', frequency: 'Каждая поставка', obligation: 'default_on', blurb: 'Рабочая запись ХАССП. Это не обязательный журнал СанПиН.' },
        { code: 'H2', title: 'Мониторинг критических точек', layer: 'haccp', frequency: 'По правилу точки', obligation: 'default_on', blurb: 'Замеры ККТ. Рабочие записи ХАССП, не журналы СанПиН.' },
        { code: 'H3', title: 'Корректирующие действия', layer: 'haccp', frequency: 'При отклонении', obligation: 'default_on', blurb: 'Несоответствия и действия. Рабочие записи ХАССП.' },
        { code: 'H4', title: 'Санитария и мойка', layer: 'haccp', frequency: 'Закрытие смены', obligation: 'default_on', blurb: 'Чек-лист уборки. Рабочая запись ХАССП.' },
        { code: 'H5', title: 'Дефростация', layer: 'haccp', frequency: 'Каждая партия', obligation: 'if_feature', feature: 'has_defrost', blurb: 'Размораживание. Рабочая запись ХАССП, если процесс включён.' },
        { code: 'H6', title: 'Температура при доставке', layer: 'haccp', frequency: 'Каждый рейс', obligation: 'if_feature', feature: 'has_delivery', blurb: 'Температура в доставке. Рабочая запись ХАССП.' },
        { code: 'H7', title: 'Концентрация дезраствора', layer: 'haccp', frequency: 'По необходимости', obligation: 'optional', blurb: 'Дополнительный учёт. Не журнал СанПиН.' }
    ];

    var DEFAULT_SETTINGS = {
        onboarded: false,
        has_warehouse: false,
        has_fryer: false,
        has_defrost: false,
        has_batch_service: false,
        has_delivery: false,
        med_social_catering: false,
        fridge_per_day: 2,
        disabled: [],
        optional_on: []
    };

    var DEFAULT_CCPS = [
        { code: 'thermoprocess', name: 'Термообработка', process_step: 'Готовка', measure: 'temperature_c', limit_min: 75, limit_max: null, frequency: 'per_batch' },
        { code: 'hot_hold', name: 'Горячее хранение', process_step: 'Мармит', measure: 'temperature_c', limit_min: 65, limit_max: null, frequency: 'per_shift' },
        { code: 'cooling', name: 'Охлаждение', process_step: 'Охлаждение', measure: 'temperature_c', limit_min: null, limit_max: 8, frequency: 'per_batch' }
    ];

    function template(code) {
        for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].code === code) return TEMPLATES[i];
        return null;
    }

    function featureOn(settings, feature) {
        if (!feature) return true;
        if (Array.isArray(feature)) {
            for (var i = 0; i < feature.length; i++) if (settings[feature[i]]) return true;
            return false;
        }
        return !!settings[feature];
    }

    function isEnabled(tpl, settings) {
        settings = settings || DEFAULT_SETTINGS;
        if (!tpl) return false;
        if (settings.disabled && settings.disabled.indexOf(tpl.code) >= 0) return false;
        if (tpl.obligation === 'always' || tpl.obligation === 'default_on') return true;
        if (tpl.obligation === 'if_feature') return featureOn(settings, tpl.feature);
        if (tpl.obligation === 'optional') return settings.optional_on && settings.optional_on.indexOf(tpl.code) >= 0;
        return false;
    }

    function enabledTemplates(settings) {
        return TEMPLATES.filter(function (tpl) { return isEnabled(tpl, settings); });
    }

    function layerLabel(layer) {
        return layer === 'sanpin' ? 'СанПиН' : 'ХАССП, рабочие записи';
    }

    function currentEntries(entries) {
        var replaced = {};
        (entries || []).forEach(function (e) { if (e && e.replaces_id) replaced[e.replaces_id] = true; });
        return (entries || []).filter(function (e) { return e && !replaced[e.id]; });
    }

    function dayKey(iso) {
        if (!iso) return '';
        return String(iso).slice(0, 10);
    }

    function todayKey() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function ensureStaff(employees, staff) {
        var list = Array.isArray(staff) ? staff.slice() : [];
        var have = {};
        list.forEach(function (p) { if (p && p.name) have[p.name] = true; });
        (employees || []).forEach(function (name) {
            if (!name || have[name]) return;
            list.push({ id: 'st_' + Math.random().toString(36).slice(2, 8), name: name, position: '', role: 'employee' });
            have[name] = true;
        });
        return list;
    }

    function defaultCcps() {
        return DEFAULT_CCPS.map(function (c) {
            return {
                id: 'ccp_' + c.code,
                code: c.code,
                name: c.name,
                process_step: c.process_step,
                measure: c.measure,
                limit_min: c.limit_min,
                limit_max: c.limit_max,
                frequency: c.frequency,
                enabled: true
            };
        });
    }

    function fridgePresets(type) {
        if (type === 'freezer') return [-22, -20, -18];
        return [2, 4, 6];
    }

    function withinRange(value, min, max) {
        if (value === '' || value === null || typeof value === 'undefined' || isNaN(Number(value))) return false;
        var n = Number(value);
        if (min !== null && typeof min !== 'undefined' && n < Number(min)) return false;
        if (max !== null && typeof max !== 'undefined' && n > Number(max)) return false;
        return true;
    }

    function validateEntry(entry, state) {
        if (!entry || entry.status !== 'submitted') return '';
        var p = entry.payload || {};
        if (entry.journal === 'J1') {
            if (p.inspection_result === 'admitted' && (!p.confirm_no_infection_self_family || !p.confirm_no_ari_skin_pustules)) {
                return 'Допуск нельзя поставить без двух подтверждений сотрудника';
            }
            if (!p.inspection_result) return 'Нужен результат осмотра: допущен или отстранён';
            if (!p.supervisor_name) return 'Нужен ответственный, который подтвердил допуск';
        }
        if (entry.journal === 'J2' || entry.journal === 'J3' || entry.journal === 'H2' || entry.journal === 'H6') {
            if (p.within_limits === false && !String(p.corrective_action || '').trim()) {
                return 'Вне предела нельзя сохранить без корректирующего действия';
            }
        }
        if (entry.journal === 'H1' && p.decision === 'rejected' && !String(p.reject_reason || '').trim()) {
            return 'Для отказа в приёмке укажите причину';
        }
        return '';
    }

    function validateSave(prev, next) {
        var oldEntries = (prev && prev.journalEntries) || [];
        var newEntries = (next && next.journalEntries) || [];
        if (!Array.isArray(newEntries)) return 'Журнал записей повреждён';
        var byId = {};
        for (var i = 0; i < newEntries.length; i++) {
            if (newEntries[i] && newEntries[i].id) byId[newEntries[i].id] = newEntries[i];
        }
        var now = Date.now();
        for (var j = 0; j < oldEntries.length; j++) {
            var old = oldEntries[j];
            if (!old || !old.id) continue;
            var found = byId[old.id];
            if (!found) {
                if (old.journal === 'J4' && old.created_at && (now - new Date(old.created_at).getTime()) < FRYER_RETAIN_MS) {
                    return 'Фритюрные записи нельзя удалять раньше 90 дней';
                }
                if (old.status === 'submitted') return 'Нельзя удалять отправленную запись';
                continue;
            }
            if (old.status === 'submitted' && JSON.stringify(old.payload) !== JSON.stringify(found.payload)) {
                return 'Отправленную запись нельзя менять. Нужна новая версия с причиной.';
            }
        }
        for (var k = 0; k < newEntries.length; k++) {
            var err = validateEntry(newEntries[k], next);
            if (err) return err;
        }
        return '';
    }

    function tasks(state) {
        var settings = state.settings || DEFAULT_SETTINGS;
        var entries = currentEntries(state.journalEntries);
        var today = todayKey();
        var list = [];
        function countToday(code) {
            return entries.filter(function (e) { return e.journal === code && e.status === 'submitted' && dayKey(e.created_at) === today; }).length;
        }
        if (isEnabled(template('J1'), settings)) {
            var staff = state.staff || [];
            var done = entries.filter(function (e) { return e.journal === 'J1' && e.status === 'submitted' && e.payload && e.payload.date === today; }).length;
            list.push({ code: 'J1', title: 'Гигиена смены', detail: done + ' из ' + staff.length, level: done >= staff.length && staff.length ? 'ok' : 'due' });
        }
        if (isEnabled(template('J2'), settings)) {
            var units = state.equipment || [];
            var need = Math.max(1, Number(settings.fridge_per_day) || 2) * units.length;
            var have = countToday('J2');
            list.push({ code: 'J2', title: 'Холодильники', detail: units.length ? (have + ' из ' + need) : 'Добавьте оборудование', level: !units.length ? 'warn' : (have >= need ? 'ok' : 'due') });
        }
        if (isEnabled(template('J3'), settings)) {
            var zones = state.zones || [];
            var zdone = countToday('J3');
            list.push({ code: 'J3', title: 'Склад', detail: zones.length ? (zdone + ' из ' + zones.length) : 'Добавьте зоны', level: !zones.length ? 'warn' : (zdone >= zones.length ? 'ok' : 'due') });
        }
        ['H1', 'H2', 'H4', 'J4', 'J5', 'J6', 'H5', 'H6', 'H7', 'H3'].forEach(function (code) {
            var tpl = template(code);
            if (!isEnabled(tpl, settings)) return;
            if (code === 'H3') {
                var open = entries.filter(function (e) { return e.journal === 'H3' && e.payload && e.payload.status !== 'closed'; }).length;
                list.push({ code: code, title: tpl.title, detail: open ? (open + ' открыто') : 'Нет открытых', level: open ? 'due' : 'ok' });
                return;
            }
            list.push({ code: code, title: tpl.title, detail: tpl.frequency, level: countToday(code) ? 'ok' : 'warn' });
        });
        return list;
    }

    function csvEscape(value) {
        var s = value === null || typeof value === 'undefined' ? '' : String(value);
        if (/[;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    }

    function fridgeCsv(state, from, to) {
        var rows = [['Дата и время', 'Оборудование', 'Тип', 'Температура, °C', 'В пределе', 'Корректирующее действие', 'Кто заполнил', 'Идентификатор']];
        currentEntries(state.journalEntries).filter(function (e) {
            if (e.journal !== 'J2' || e.status !== 'submitted') return false;
            var day = dayKey(e.created_at);
            if (from && day < from) return false;
            if (to && day > to) return false;
            return true;
        }).forEach(function (e) {
            var p = e.payload || {};
            rows.push([e.created_at, p.equipment_name || '', p.equipment_type || '', p.temperature_c, p.within_limits ? 'да' : 'нет', p.corrective_action || '', e.author_name || '', e.id]);
        });
        return rows.map(function (r) { return r.map(csvEscape).join(';'); }).join('\n');
    }

    return {
        EDIT_POLICY: EDIT_POLICY,
        FRYER_RETAIN_MS: FRYER_RETAIN_MS,
        TEMPLATES: TEMPLATES,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        template: template,
        isEnabled: isEnabled,
        enabledTemplates: enabledTemplates,
        layerLabel: layerLabel,
        currentEntries: currentEntries,
        dayKey: dayKey,
        todayKey: todayKey,
        ensureStaff: ensureStaff,
        defaultCcps: defaultCcps,
        fridgePresets: fridgePresets,
        withinRange: withinRange,
        validateEntry: validateEntry,
        validateSave: validateSave,
        tasks: tasks,
        fridgeCsv: fridgeCsv
    };
});
