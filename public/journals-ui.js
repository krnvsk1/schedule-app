(function () {
    var J = window.Journals;
    var settings = Object.assign({}, J.DEFAULT_SETTINGS);
    var staff = [];
    var equipment = [];
    var zones = [];
    var ccps = [];
    var journalEntries = [];
    var screen = 'today';
    var activeCode = '';

    function snapshot() {
        return {
            journalSettings: settings,
            staff: staff,
            equipment: equipment,
            zones: zones,
            ccps: ccps,
            journalEntries: journalEntries
        };
    }

    function ingest(data) {
        settings = Object.assign({}, J.DEFAULT_SETTINGS, data.journalSettings || {});
        staff = J.ensureStaff(data.employees || [], data.staff || []);
        equipment = Array.isArray(data.equipment) ? data.equipment : [];
        zones = Array.isArray(data.zones) ? data.zones : [];
        ccps = Array.isArray(data.ccps) && data.ccps.length ? data.ccps : J.defaultCcps();
        journalEntries = Array.isArray(data.journalEntries) ? data.journalEntries : [];
    }

    function persist(cb) {
        var err = J.validateSave({ journalEntries: journalEntries }, snapshot());
        if (err) { showToast(err, 'error'); return; }
        saveData(cb || function () { showToast('Сохранено', 'success'); render(); });
    }

    function authorName() {
        var sel = document.getElementById('journalAuthor');
        if (sel && sel.value) return sel.value;
        var sup = staff.filter(function (p) { return p.role === 'supervisor'; })[0];
        return sup ? sup.name : (staff[0] ? staff[0].name : 'Сотрудник');
    }

    function pushEntry(journal, payload, status) {
        journalEntries.push({
            id: 'j_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            journal: journal,
            status: status || 'submitted',
            version: 1,
            replaces_id: '',
            edit_reason: '',
            created_at: new Date().toISOString(),
            author_name: authorName(),
            payload: payload
        });
    }

    function latest(code) {
        return J.currentEntries(journalEntries).filter(function (e) { return e.journal === code; }).sort(function (a, b) {
            return a.created_at < b.created_at ? 1 : -1;
        });
    }

    function go(next, code) {
        screen = next;
        if (code) activeCode = code;
        render();
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function shell(title, body) {
        return '<div class="j-wrap"><div class="j-nav"><button type="button" class="month-nav-btn" id="jBack" aria-label="Назад"><i class="fas fa-chevron-left"></i></button><h2 class="j-title">' + title + '</h2></div>' + body + '</div>';
    }

    function authorSelect() {
        var html = '<label class="j-label">Кто заполняет</label><select class="input-field mb-3" id="journalAuthor">';
        staff.forEach(function (p) { html += '<option value="' + escHTML(p.name) + '">' + escHTML(p.name) + (p.role === 'supervisor' ? ' · ответственный' : '') + '</option>'; });
        if (!staff.length) html += '<option value="Сотрудник">Сотрудник</option>';
        return html + '</select>';
    }

    function renderToday() {
        if (!settings.onboarded) return renderOnboarding();
        var cards = J.tasks({ settings: settings, staff: staff, equipment: equipment, zones: zones, journalEntries: journalEntries });
        var html = '<div class="j-wrap"><h2 class="j-title">Сегодня</h2><p class="j-note">Красное — ещё не заполнено. Жёлтое — рабочая запись ХАССП, это не журнал СанПиН.</p>';
        cards.forEach(function (c) {
            var tpl = J.template(c.code);
            html += '<button type="button" class="j-row ' + c.level + '" data-open="' + c.code + '"><div class="j-rail"><span class="j-dot"></span></div><div class="j-main"><div class="j-kicker">' + J.layerLabel(tpl.layer) + '</div><div class="j-card-title">' + escHTML(c.title) + '</div><div class="j-card-detail">' + escHTML(c.detail) + '</div></div><i class="fas fa-chevron-right j-chev"></i></button>';
        });
        html += '<div class="j-actions"><button type="button" class="chip-btn" id="jAdmin">Справочники</button><button type="button" class="chip-btn" id="jDev">Отклонения</button></div></div>';
        return html;
    }

    function renderOnboarding() {
        var flags = [
            ['has_warehouse', 'Есть склад'],
            ['has_fryer', 'Есть фритюр'],
            ['has_defrost', 'Есть дефростация'],
            ['has_batch_service', 'Раздача партиями или кейтеринг'],
            ['has_delivery', 'Есть доставка'],
            ['med_social_catering', 'Мед или соцпитание']
        ];
        var html = '<div class="j-wrap"><h2 class="j-title">Какие процессы есть</h2><p class="j-note">Всегда включены гигиена, холодильники и рабочие записи ХАССП. Остальное — только если процесс есть. ХАССП здесь не называется обязательным журналом СанПиН.</p>';
        flags.forEach(function (f) {
            html += '<label class="j-check"><input type="checkbox" data-flag="' + f[0] + '"' + (settings[f[0]] ? ' checked' : '') + '> ' + f[1] + '</label>';
        });
        html += '<button type="button" class="btn-primary mt-3" id="jStart">Начать</button></div>';
        return html;
    }

    function renderFeed() {
        var tpl = J.template(activeCode);
        var rows = latest(activeCode).slice(0, 30);
        var html = shell(tpl ? tpl.title : 'Журнал', '<p class="j-note">' + escHTML(tpl ? tpl.blurb : '') + '</p><button type="button" class="btn-primary mb-3" id="jAdd">Добавить запись</button>');
        if (!rows.length) html += '<div class="empty-state">Записей пока нет</div>';
        rows.forEach(function (e) {
            var when = e.created_at ? new Date(e.created_at) : null;
            var day = when ? when.getDate() : '';
            var mon = when ? MONTHS_GEN[when.getMonth()] : '';
            html += '<div class="j-row view"><div class="j-rail"><div class="dr-name">' + day + '</div><div class="dr-date">' + mon + '</div></div><div class="j-main"><div class="j-card-title">' + escHTML(entryTitle(e)) + '</div><div class="j-card-detail">' + escHTML(e.author_name || '') + '</div></div></div>';
        });
        if (activeCode === 'J2') html += '<button type="button" class="chip-btn" id="jExport">Скачать CSV за месяц</button> <button type="button" class="chip-btn" id="jPrint">Печать / PDF</button>';
        return html;
    }

    function entryTitle(e) {
        var p = e.payload || {};
        if (e.journal === 'J1') return (p.employee_name || '') + ' · ' + (p.inspection_result === 'admitted' ? 'допущен' : 'отстранён');
        if (e.journal === 'J2') return (p.equipment_name || 'Холодильник') + ' · ' + p.temperature_c + ' °C';
        if (e.journal === 'J3') return (p.zone_name || 'Зона') + ' · ' + p.temperature_c + ' °C';
        if (e.journal === 'H2') return (p.ccp_name || 'ККТ') + ' · ' + p.measured_value;
        if (e.journal === 'H3') return p.description || 'Несоответствие';
        return p.product_name || p.dish_name || p.product || p.fat_type || e.journal;
    }

    function renderForm() {
        if (activeCode === 'J1') return renderHygiene();
        if (activeCode === 'J2') return renderFridges();
        if (activeCode === 'J3') return renderZones();
        if (activeCode === 'J4') return renderFryer();
        if (activeCode === 'J5') return renderReadyCheck();
        if (activeCode === 'J6' || activeCode === 'H1') return renderIntake(activeCode);
        if (activeCode === 'H2') return renderCcp();
        if (activeCode === 'H3') return renderCapa();
        if (activeCode === 'H4') return renderCleaning();
        if (activeCode === 'H5') return renderDefrost();
        if (activeCode === 'H6') return renderDeliveryTemp();
        if (activeCode === 'H7') return renderSanitizer();
        return shell('Журнал', '<div class="empty-state">Форма не найдена</div>');
    }

    function renderHygiene() {
        var html = shell('Гигиена смены', authorSelect() + '<p class="j-note">Сотрудник подтверждает два пункта. Ответственный ставит допуск. Без обоих подтверждений допустить нельзя.</p>');
        staff.forEach(function (p, idx) {
            html += '<div class="j-person" data-staff="' + escHTML(p.id) + '"><div class="j-card-title">' + escHTML(p.name) + '</div>';
            html += '<label class="j-check"><input type="checkbox" class="h-inf"> Нет признаков инфекции у меня и семьи</label>';
            html += '<label class="j-check"><input type="checkbox" class="h-ari"> Нет ОРВИ и гнойничков на коже</label>';
            html += '<div class="j-actions"><button type="button" class="chip-btn h-yes" data-i="' + idx + '">Допустить</button><button type="button" class="chip-btn h-no" data-i="' + idx + '">Отстранить</button></div></div>';
        });
        if (!staff.length) html += '<div class="empty-state">Добавьте сотрудников в справочнике</div>';
        return html;
    }

    function renderFridges() {
        var html = shell('Холодильники', authorSelect() + '<p class="j-note">Журнал СанПиН. Если температура вне предела, без действия не сохранится.</p>');
        if (!equipment.length) return html + '<div class="empty-state">Добавьте холодильники в справочнике</div>';
        equipment.forEach(function (eq) {
            var presets = J.fridgePresets(eq.type).map(function (n) { return '<button type="button" class="chip-btn t-preset" data-eq="' + eq.id + '" data-v="' + n + '">' + n + '</button>'; }).join('');
            html += '<div class="temp-card" data-eq="' + eq.id + '"><div class="j-card-title">' + escHTML(eq.name) + '</div><div class="j-card-detail">' + (eq.type === 'freezer' ? 'Морозильник' : 'Холодильник') + ' · ' + eq.limit_min_c + '…' + eq.limit_max_c + ' °C</div>';
            html += '<div class="temp-row"><button type="button" class="chip-btn t-step" data-eq="' + eq.id + '" data-d="-1">−1</button><button type="button" class="chip-btn t-step" data-eq="' + eq.id + '" data-d="-0.5">−0.5</button><input class="input-field t-val" data-eq="' + eq.id + '" inputmode="decimal" placeholder="°C"><button type="button" class="chip-btn t-step" data-eq="' + eq.id + '" data-d="0.5">+0.5</button><button type="button" class="chip-btn t-step" data-eq="' + eq.id + '" data-d="1">+1</button></div>';
            html += '<div class="j-actions">' + presets + '</div><input class="input-field t-fix" data-eq="' + eq.id + '" placeholder="Что сделали, если вне предела" style="display:none"></div>';
        });
        html += '<button type="button" class="btn-primary mt-3" id="jSaveFridges">Сохранить замеры</button>';
        return html;
    }

    function renderZones() {
        var html = shell('Склад', authorSelect());
        zones.forEach(function (z) {
            html += '<div class="temp-card"><div class="j-card-title">' + escHTML(z.name) + '</div><input class="input-field mb-2 z-temp" data-z="' + z.id + '" placeholder="Температура, °C"><input class="input-field mb-2 z-hum" data-z="' + z.id + '" placeholder="Влажность, %"><input class="input-field z-fix" data-z="' + z.id + '" placeholder="Действие, если вне предела"></div>';
        });
        if (!zones.length) html += '<div class="empty-state">Добавьте зоны склада</div>';
        else html += '<button type="button" class="btn-primary" id="jSaveZones">Сохранить</button>';
        return html;
    }

    function simpleForm(title, fields, saveId) {
        var html = shell(title, authorSelect());
        fields.forEach(function (f) {
            if (f.type === 'select') {
                html += '<label class="j-label">' + f.label + '</label><select class="input-field mb-2" id="' + f.id + '">';
                f.options.forEach(function (op) { html += '<option value="' + escHTML(op[0]) + '">' + escHTML(op[1]) + '</option>'; });
                html += '</select>';
            } else if (f.type === 'check') {
                html += '<label class="j-check"><input type="checkbox" id="' + f.id + '"> ' + f.label + '</label>';
            } else {
                html += '<input class="input-field mb-2" id="' + f.id + '" placeholder="' + escHTML(f.label) + '"' + (f.type === 'number' ? ' inputmode="decimal"' : '') + '>';
            }
        });
        html += '<button type="button" class="btn-primary" id="' + saveId + '">Сохранить</button>';
        return html;
    }

    function renderFryer() {
        return simpleForm('Фритюрные жиры', [
            { id: 'fat_type', label: 'Вид жира' },
            { id: 'fryer_name', label: 'Фритюрница' },
            { id: 'product_fried', label: 'Что жарили' },
            { id: 'organoleptic_start', label: 'В начале', type: 'select', options: [['ok', 'Запах и цвет в норме'], ['replace_needed', 'Нужна замена']] },
            { id: 'organoleptic_end', label: 'В конце', type: 'select', options: [['ok', 'В норме'], ['replace_needed', 'Нужна замена']] },
            { id: 'remaining_kg', label: 'Остаток, кг', type: 'number' },
            { id: 'disposed_kg', label: 'Утилизировано, кг', type: 'number' },
            { id: 'replaced', label: 'Жир заменён', type: 'check' }
        ], 'jSaveFryer');
    }

    function renderReadyCheck() {
        return simpleForm('Бракераж готовой продукции', [
            { id: 'dish_name', label: 'Блюдо' },
            { id: 'organoleptic', label: 'Вид, запах, вкус, консистенция' },
            { id: 'allowed_to_serve', label: 'Решение', type: 'select', options: [['yes', 'Можно подавать'], ['no', 'Нельзя подавать']] },
            { id: 'portion_weight_g', label: 'Масса порции, г', type: 'number' },
            { id: 'reject_reason', label: 'Причина отказа или что сделали' }
        ], 'jSaveReady');
    }

    function renderIntake(code) {
        var title = code === 'J6' ? 'Бракераж при приёмке' : 'Входной контроль';
        return simpleForm(title, [
            { id: 'supplier', label: 'Поставщик' },
            { id: 'product_name', label: 'Продукт' },
            { id: 'lot', label: 'Партия' },
            { id: 'quantity', label: 'Количество' },
            { id: 'expire_at', label: 'Годен до' },
            { id: 'arrival_temperature_c', label: 'Температура при приёмке, °C', type: 'number' },
            { id: 'package_integrity', label: 'Упаковка', type: 'select', options: [['ok', 'Целая'], ['damaged', 'Повреждена']] },
            { id: 'docs_present', label: 'Документы есть', type: 'check' },
            { id: 'organoleptic_ok', label: 'Органолептика в норме', type: 'check' },
            { id: 'decision', label: 'Решение', type: 'select', options: [['accepted', 'Принято'], ['rejected', 'Отказ']] },
            { id: 'reject_reason', label: 'Причина отказа' }
        ], 'jSaveIntake');
    }

    function renderCcp() {
        var options = ccps.filter(function (c) { return c.enabled !== false; }).map(function (c) { return [c.id, c.name]; });
        if (!options.length) options = [['', 'Нет точек']];
        return simpleForm('Критическая точка', [
            { id: 'ccp_id', label: 'Точка', type: 'select', options: options },
            { id: 'object_ref', label: 'Блюдо или партия' },
            { id: 'measured_value', label: 'Измеренное значение', type: 'number' },
            { id: 'corrective_action', label: 'Действие, если вне предела' }
        ], 'jSaveCcp');
    }

    function renderCapa() {
        return simpleForm('Корректирующее действие', [
            { id: 'description', label: 'Что случилось' },
            { id: 'affected_product_batch', label: 'Продукт или партия' },
            { id: 'immediate_action', label: 'Что сделали сразу' },
            { id: 'product_disposition', label: 'Продукт', type: 'select', options: [['use', 'Можно использовать'], ['rework', 'Переработать'], ['dispose', 'Утилизировать'], ['hold', 'Задержать']] }
        ], 'jSaveCapa');
    }

    function renderCleaning() {
        var zonesList = ['Кухня', 'Холодный цех', 'Мойка', 'Склад', 'Зал'];
        var html = shell('Мойка смены', authorSelect());
        zonesList.forEach(function (z, i) {
            html += '<label class="j-check"><input type="checkbox" class="clean-zone" data-zone="' + escHTML(z) + '"> ' + z + ' убрана</label>';
        });
        html += '<button type="button" class="btn-primary mt-3" id="jSaveClean">Сохранить чек-лист</button>';
        return html;
    }

    function renderDefrost() {
        return simpleForm('Дефростация', [
            { id: 'product', label: 'Продукт' },
            { id: 'lot', label: 'Партия' },
            { id: 'method', label: 'Способ', type: 'select', options: [['fridge', 'В холодильнике'], ['cold_water', 'В холодной воде'], ['other', 'Другой по инструкции']] },
            { id: 'zone_temp_c', label: 'Температура зоны, °C', type: 'number' },
            { id: 'product_temp_end_c', label: 'Температура продукта в конце, °C', type: 'number' },
            { id: 'released', label: 'Можно пускать в работу', type: 'check' }
        ], 'jSaveDefrost');
    }

    function renderDeliveryTemp() {
        return simpleForm('Доставка', [
            { id: 'route', label: 'Рейс или адрес' },
            { id: 'temperature_c', label: 'Температура, °C', type: 'number' },
            { id: 'corrective_action', label: 'Действие, если вне предела' }
        ], 'jSaveDelivery');
    }

    function renderSanitizer() {
        return simpleForm('Дезраствор', [
            { id: 'product_name', label: 'Средство' },
            { id: 'target_concentration', label: 'Нужная концентрация' },
            { id: 'measured_concentration', label: 'Измеренная' },
            { id: 'method', label: 'Способ проверки' }
        ], 'jSaveSanitizer');
    }

    function renderAdmin() {
        var html = shell('Справочники', '<p class="j-note">Оборудование, складские зоны и роли сотрудников.</p>');
        html += '<div class="j-label">Холодильники</div><div class="temp-card"><input class="input-field mb-2" id="eqName" placeholder="Название"><select class="input-field mb-2" id="eqType"><option value="fridge">Холодильник</option><option value="freezer">Морозильник</option></select><button type="button" class="btn-primary" id="eqAdd">Добавить</button></div>';
        if (!equipment.length) html += '<div class="empty-state">Холодильников пока нет</div>';
        equipment.forEach(function (eq) {
            html += '<div class="j-row view"><div class="j-rail"><i class="fas fa-temperature-low"></i></div><div class="j-main"><div class="j-card-title">' + escHTML(eq.name) + '</div><div class="j-card-detail">' + (eq.type === 'freezer' ? 'Морозильник' : 'Холодильник') + ' · ' + eq.limit_min_c + '…' + eq.limit_max_c + ' °C</div></div></div>';
        });
        html += '<div class="j-label">Зоны склада</div><div class="temp-card"><input class="input-field mb-2" id="zoneName" placeholder="Название зоны"><button type="button" class="btn-primary" id="zoneAdd">Добавить</button></div>';
        if (!zones.length) html += '<div class="empty-state">Зон пока нет</div>';
        zones.forEach(function (z) {
            html += '<div class="j-row view"><div class="j-rail"><i class="fas fa-warehouse"></i></div><div class="j-main"><div class="j-card-title">' + escHTML(z.name) + '</div><div class="j-card-detail">' + z.temp_min + '…' + z.temp_max + ' °C</div></div></div>';
        });
        html += '<div class="j-label">Сотрудники</div><div class="temp-card"><input class="input-field mb-2" id="staffName" placeholder="Фамилия и имя" maxlength="80"><input class="input-field mb-2" id="staffPosition" placeholder="Должность" maxlength="80"><select class="input-field mb-2" id="staffRole"><option value="employee">Сотрудник</option><option value="cook">Повар</option><option value="storekeeper">Кладовщик</option><option value="supervisor">Ответственный</option></select><button type="button" class="btn-primary" id="staffAdd">Добавить сотрудника</button></div>';
        if (!staff.length) html += '<div class="empty-state">Сотрудников пока нет</div>';
        staff.forEach(function (p) {
            html += '<div class="j-row view"><div class="j-rail"><i class="fas fa-user"></i></div><div class="j-main"><div class="j-card-title">' + escHTML(p.name) + '</div><div class="j-card-detail">' + escHTML(p.position || 'Без должности') + '</div></div><select class="input-field role-select" data-id="' + escHTML(p.id) + '">' + roleOptions(p.role) + '</select></div>';
        });
        html += '<button type="button" class="j-row warn" id="jOptional"><div class="j-rail"><span class="j-dot"></span></div><div class="j-main"><div class="j-card-title">Учёт дезраствора</div><div class="j-card-detail">Дополнительная запись ХАССП</div></div><i class="fas fa-chevron-right j-chev"></i></button>';
        return html;
    }

    function roleOptions(current) {
        var roles = [['employee', 'Сотрудник'], ['cook', 'Повар'], ['storekeeper', 'Кладовщик'], ['supervisor', 'Ответственный']];
        return roles.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === current ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('');
    }

    function renderDeviations() {
        var rows = J.currentEntries(journalEntries).filter(function (e) {
            var p = e.payload || {};
            return p.within_limits === false || (e.journal === 'H3' && p.status !== 'closed') || p.inspection_result === 'suspended' || p.decision === 'rejected' || p.allowed_to_serve === 'no';
        });
        var html = shell('Отклонения', '');
        if (!rows.length) html += '<div class="empty-state">Отклонений нет</div>';
        rows.forEach(function (e) { html += '<div class="j-row due view"><div class="j-rail"><span class="j-dot"></span></div><div class="j-main"><div class="j-card-title">' + escHTML(entryTitle(e)) + '</div><div class="j-card-detail">' + escHTML((e.payload && e.payload.corrective_action) || e.author_name || '') + '</div></div></div>'; });
        return html;
    }

    function render() {
        var root = document.getElementById('journalView');
        if (!root) return;
        var html = screen === 'feed' ? renderFeed() : screen === 'form' ? renderForm() : screen === 'admin' ? renderAdmin() : screen === 'deviations' ? renderDeviations() : renderToday();
        root.innerHTML = html;
        bind();
    }

    function val(id) { var el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; }

    function saveChecked(journal, payload) {
        var entry = { journal: journal, status: 'submitted', payload: payload };
        var err = J.validateEntry(entry, snapshot());
        if (err) { showToast(err, 'error'); return; }
        pushEntry(journal, payload, 'submitted');
        persist(function () { showToast('Сохранено', 'success'); go('feed', journal); });
    }

    function bind() {
        var back = document.getElementById('jBack');
        if (back) back.onclick = function () { go(screen === 'form' ? 'feed' : 'today', activeCode); };
        var root = document.getElementById('journalView');
        root.querySelectorAll('[data-open]').forEach(function (btn) {
            btn.onclick = function () { go('feed', btn.getAttribute('data-open')); };
        });
        var add = document.getElementById('jAdd');
        if (add) add.onclick = function () { go('form', activeCode); };
        var admin = document.getElementById('jAdmin');
        if (admin) admin.onclick = function () { go('admin'); };
        var dev = document.getElementById('jDev');
        if (dev) dev.onclick = function () { go('deviations'); };
        var start = document.getElementById('jStart');
        if (start) start.onclick = function () {
            root.querySelectorAll('[data-flag]').forEach(function (box) { settings[box.getAttribute('data-flag')] = box.checked; });
            settings.onboarded = true;
            if (!ccps.length) ccps = J.defaultCcps();
            persist(function () { showToast('Журналы включены', 'success'); go('today'); });
        };
        root.querySelectorAll('.h-yes, .h-no').forEach(function (btn) {
            btn.onclick = function () {
                var idx = Number(btn.getAttribute('data-i'));
                var person = staff[idx];
                var box = btn.closest('.j-person');
                var inf = box.querySelector('.h-inf').checked;
                var ari = box.querySelector('.h-ari').checked;
                var result = btn.classList.contains('h-yes') ? 'admitted' : 'suspended';
                var payload = {
                    date: J.todayKey(),
                    employee_id: person.id,
                    employee_name: person.name,
                    position: person.position || '',
                    confirm_no_infection_self_family: inf,
                    confirm_no_ari_skin_pustules: ari,
                    employee_confirmed_at: new Date().toISOString(),
                    inspection_result: result,
                    supervisor_name: authorName(),
                    supervisor_confirmed_at: new Date().toISOString()
                };
                saveChecked('J1', payload);
            };
        });
        root.querySelectorAll('.t-step, .t-preset').forEach(function (btn) {
            btn.onclick = function () {
                var id = btn.getAttribute('data-eq');
                var input = root.querySelector('.t-val[data-eq="' + id + '"]');
                var next = btn.hasAttribute('data-v') ? Number(btn.getAttribute('data-v')) : (Number(String(input.value).replace(',', '.')) || 0) + Number(btn.getAttribute('data-d'));
                input.value = String(Math.round(next * 10) / 10);
                markFridge(id);
            };
        });
        root.querySelectorAll('.t-val').forEach(function (input) {
            input.oninput = function () { markFridge(input.getAttribute('data-eq')); };
        });
        var saveF = document.getElementById('jSaveFridges');
        if (saveF) saveF.onclick = saveFridges;
        var saveZ = document.getElementById('jSaveZones');
        if (saveZ) saveZ.onclick = saveZones;
        bindSimple('jSaveFryer', 'J4', function () {
            return { started_at: new Date().toISOString(), fat_type: val('fat_type'), fryer_name: val('fryer_name'), product_fried: val('product_fried'), organoleptic_start: val('organoleptic_start'), organoleptic_end: val('organoleptic_end'), remaining_kg: val('remaining_kg'), disposed_kg: val('disposed_kg'), replaced: val('replaced'), controller_name: authorName() };
        });
        bindSimple('jSaveReady', 'J5', function () {
            return { cooked_at: new Date().toISOString(), inspection_at: new Date().toISOString(), dish_name: val('dish_name'), organoleptic: val('organoleptic'), allowed_to_serve: val('allowed_to_serve'), portion_weight_g: val('portion_weight_g'), reject_reason: val('reject_reason'), commission_confirmed_by: authorName() };
        });
        bindSimple('jSaveIntake', activeCode, function () {
            return { received_at: new Date().toISOString(), supplier: val('supplier'), product_name: val('product_name'), lot: val('lot'), quantity: val('quantity'), expire_at: val('expire_at'), arrival_temperature_c: val('arrival_temperature_c'), package_integrity: val('package_integrity'), docs_present: val('docs_present'), organoleptic_ok: val('organoleptic_ok'), decision: val('decision'), reject_reason: val('reject_reason') };
        });
        bindSimple('jSaveCcp', 'H2', function () {
            var ccp = null;
            ccps.forEach(function (c) { if (c.id === val('ccp_id')) ccp = c; });
            var measured = val('measured_value');
            var ok = ccp ? J.withinRange(measured, ccp.limit_min, ccp.limit_max) : false;
            return { ccp_id: ccp ? ccp.id : '', ccp_name: ccp ? ccp.name : '', object_ref: val('object_ref'), measured_value: measured, within_limits: ok, corrective_action: val('corrective_action') };
        });
        bindSimple('jSaveCapa', 'H3', function () {
            return { opened_at: new Date().toISOString(), source: 'other', description: val('description'), affected_product_batch: val('affected_product_batch'), immediate_action: val('immediate_action'), product_disposition: val('product_disposition'), status: 'open', owner_name: authorName() };
        });
        var saveClean = document.getElementById('jSaveClean');
        if (saveClean) saveClean.onclick = function () {
            var checks = [];
            root.querySelectorAll('.clean-zone').forEach(function (box) { checks.push({ zone: box.getAttribute('data-zone'), done: box.checked }); });
            saveChecked('H4', { date: J.todayKey(), checks: checks });
        };
        bindSimple('jSaveDefrost', 'H5', function () {
            return { product: val('product'), lot: val('lot'), method: val('method'), zone_temp_c: val('zone_temp_c'), started_at: new Date().toISOString(), product_temp_end_c: val('product_temp_end_c'), released: val('released') };
        });
        bindSimple('jSaveDelivery', 'H6', function () {
            var t = Number(String(val('temperature_c')).replace(',', '.'));
            var ok = t >= 65 || t <= 6;
            return { route: val('route'), temperature_c: t, within_limits: ok, corrective_action: val('corrective_action') };
        });
        bindSimple('jSaveSanitizer', 'H7', function () {
            return { product_name: val('product_name'), target_concentration: val('target_concentration'), measured_concentration: val('measured_concentration'), method: val('method') };
        });
        var exp = document.getElementById('jExport');
        if (exp) exp.onclick = exportFridge;
        var print = document.getElementById('jPrint');
        if (print) print.onclick = printFridge;
        var eqAdd = document.getElementById('eqAdd');
        if (eqAdd) eqAdd.onclick = function () {
            var name = val('eqName');
            var type = val('eqType') || 'fridge';
            if (!name) return;
            equipment.push({ id: 'eq_' + Date.now().toString(36), name: name, location: '', type: type, limit_min_c: type === 'freezer' ? -23 : 0, limit_max_c: type === 'freezer' ? -18 : 6 });
            persist(function () { go('admin'); });
        };
        var zoneAdd = document.getElementById('zoneAdd');
        if (zoneAdd) zoneAdd.onclick = function () {
            var name = val('zoneName');
            if (!name) return;
            zones.push({ id: 'zn_' + Date.now().toString(36), name: name, temp_min: 0, temp_max: 25, humidity_min: 40, humidity_max: 75 });
            persist(function () { go('admin'); });
        };
        var staffAdd = document.getElementById('staffAdd');
        if (staffAdd) staffAdd.onclick = function () {
            var name = val('staffName');
            if (name.length < 2) { showToast('Введите имя сотрудника', 'error'); return; }
            for (var i = 0; i < staff.length; i++) {
                if (staff[i].name.toLowerCase() === name.toLowerCase()) { showToast('Такой сотрудник уже есть', 'error'); return; }
            }
            staff.push({ id: 'st_' + Date.now().toString(36), name: name, position: val('staffPosition'), role: val('staffRole') || 'employee' });
            if (typeof employees !== 'undefined' && employees.indexOf(name) < 0) employees.push(name);
            persist(function () { showToast('Сотрудник добавлен', 'success'); go('admin'); });
        };
        root.querySelectorAll('.role-select').forEach(function (sel) {
            sel.onchange = function () {
                staff.forEach(function (p) { if (p.id === sel.getAttribute('data-id')) p.role = sel.value; });
                persist(function () { showToast('Права обновлены', 'success'); go('admin'); });
            };
        });
        var opt = document.getElementById('jOptional');
        if (opt) opt.onclick = function () {
            settings.optional_on = settings.optional_on || [];
            if (settings.optional_on.indexOf('H7') < 0) settings.optional_on.push('H7');
            persist(function () { showToast('Учёт дезраствора включён', 'success'); go('today'); });
        };
    }

    function bindSimple(id, journal, builder) {
        var btn = document.getElementById(id);
        if (!btn) return;
        btn.onclick = function () { saveChecked(journal, builder()); };
    }

    function markFridge(id) {
        var eq = equipment.filter(function (e) { return e.id === id; })[0];
        var input = document.querySelector('.t-val[data-eq="' + id + '"]');
        var fix = document.querySelector('.t-fix[data-eq="' + id + '"]');
        if (!eq || !input || !fix) return;
        var ok = J.withinRange(String(input.value).replace(',', '.'), eq.limit_min_c, eq.limit_max_c);
        fix.style.display = input.value && !ok ? 'block' : 'none';
        input.style.borderColor = input.value && !ok ? '#dc2626' : '';
    }

    function saveFridges() {
        var made = 0;
        for (var i = 0; i < equipment.length; i++) {
            var eq = equipment[i];
            var input = document.querySelector('.t-val[data-eq="' + eq.id + '"]');
            if (!input || input.value === '') continue;
            var temp = Number(String(input.value).replace(',', '.'));
            var ok = J.withinRange(temp, eq.limit_min_c, eq.limit_max_c);
            var fix = document.querySelector('.t-fix[data-eq="' + eq.id + '"]');
            var payload = { equipment_id: eq.id, equipment_name: eq.name, equipment_type: eq.type, limit_min_c: eq.limit_min_c, limit_max_c: eq.limit_max_c, temperature_c: temp, within_limits: ok, corrective_action: fix ? fix.value.trim() : '' };
            var err = J.validateEntry({ journal: 'J2', status: 'submitted', payload: payload }, snapshot());
            if (err) { showToast(eq.name + ': ' + err, 'error'); return; }
            pushEntry('J2', payload, 'submitted');
            made++;
        }
        if (!made) { showToast('Введите хотя бы одну температуру', 'error'); return; }
        persist(function () { showToast('Сохранено', 'success'); go('feed', 'J2'); });
    }

    function saveZones() {
        var made = 0;
        for (var i = 0; i < zones.length; i++) {
            var z = zones[i];
            var tempEl = document.querySelector('.z-temp[data-z="' + z.id + '"]');
            var humEl = document.querySelector('.z-hum[data-z="' + z.id + '"]');
            if (!tempEl || tempEl.value === '' || !humEl || humEl.value === '') continue;
            var temp = Number(String(tempEl.value).replace(',', '.'));
            var hum = Number(String(humEl.value).replace(',', '.'));
            var ok = J.withinRange(temp, z.temp_min, z.temp_max) && J.withinRange(hum, z.humidity_min, z.humidity_max);
            var fix = document.querySelector('.z-fix[data-z="' + z.id + '"]');
            var payload = { zone_id: z.id, zone_name: z.name, temperature_c: temp, humidity_percent: hum, within_limits: ok, corrective_action: fix ? fix.value.trim() : '' };
            var err = J.validateEntry({ journal: 'J3', status: 'submitted', payload: payload }, snapshot());
            if (err) { showToast(z.name + ': ' + err, 'error'); return; }
            pushEntry('J3', payload, 'submitted');
            made++;
        }
        if (!made) { showToast('Заполните зону', 'error'); return; }
        persist(function () { showToast('Сохранено', 'success'); go('feed', 'J3'); });
    }

    function monthRange() {
        var now = new Date();
        var from = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
        var to = J.todayKey();
        return { from: from, to: to };
    }

    function exportFridge() {
        var range = monthRange();
        var csv = '\uFEFF' + J.fridgeCsv({ journalEntries: journalEntries }, range.from, range.to);
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'holodilniki-' + range.from + '.csv';
        a.click();
    }

    function printFridge() {
        var range = monthRange();
        var rows = J.currentEntries(journalEntries).filter(function (e) {
            return e.journal === 'J2' && e.status === 'submitted' && J.dayKey(e.created_at) >= range.from && J.dayKey(e.created_at) <= range.to;
        });
        var html = '<html><head><meta charset="utf-8"><title>Журнал холодильников</title></head><body><h1>Температура холодильного оборудования</h1><p>' + range.from + ' — ' + range.to + '</p><table border="1" cellspacing="0" cellpadding="6"><tr><th>Дата и время</th><th>Оборудование</th><th>°C</th><th>В пределе</th><th>Действие</th><th>Кто заполнил</th></tr>';
        rows.forEach(function (e) {
            var p = e.payload || {};
            html += '<tr><td>' + e.created_at + '</td><td>' + (p.equipment_name || '') + '</td><td>' + p.temperature_c + '</td><td>' + (p.within_limits ? 'да' : 'нет') + '</td><td>' + (p.corrective_action || '') + '</td><td>' + (e.author_name || '') + '</td></tr>';
        });
        html += '</table><script>print()<\/script></body></html>';
        var w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
    }

    window.JournalUI = { ingest: ingest, snapshot: snapshot, render: render, go: go };
})();
