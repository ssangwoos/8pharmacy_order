/* ==========================================================================
   [1] Firebase 설정 및 라이브러리 임포트
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, updateDoc, doc, query, where, orderBy, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyA250TRzQCM9FMqiXBROX3IknKE1FZp5rc", 
    authDomain: "pharmacy-order-5ddc5.firebaseapp.com",
    projectId: "pharmacy-order-5ddc5",
    storageBucket: "pharmacy-order-5ddc5.firebasestorage.app", 
    messagingSenderId: "713414389922",
    appId: "1:713414389922:web:606452de8b27fe847ca7fb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
console.log("🔥 Firebase Connected!");


/* ==========================================================================
   [2] 전역 변수 선언
   ========================================================================== */
let currentProduct = null;      
let currentQty = 1;             
let currentOptionPrice = 0;     
let currentOptionId = null;     
let cartItems = [];             

let deletedItemBackup = null;   
let undoTimeout = null;         

let calDate = new Date(); 
let selectedDateStr = null; 

let currentSupplierId = null;
let editingProductId = null; 
let allProductsData = []; 
let allSuppliersData = [];

let currentPhotoReqId = null; 
let tempUploadFile = null;


/* ==========================================================================
   [3] 초기화 및 공통 함수
   ========================================================================== */
document.querySelectorAll('[id^="btn-close"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modal = e.target.closest('[id$="-modal"]');
        if(modal) modal.style.display = 'none';
    });
});

const viewer = document.getElementById('photo-viewer-modal');
if(viewer) {
    viewer.addEventListener('click', (e) => { if(e.target === viewer) viewer.style.display = 'none'; });
    viewer.querySelector('#viewer-close').addEventListener('click', () => viewer.style.display = 'none');
}

function formatShortTime(timestamp) {
    if(!timestamp) return "";
    const d = timestamp.toDate();
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// [Global] SMS 클릭 (PC/모바일 분기)
window.handleSmsClick = function(phoneNumber) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) { window.location.href = `sms:${phoneNumber}`; } 
    else { navigator.clipboard.writeText(phoneNumber).then(() => alert(`번호(${phoneNumber}) 복사됨`)).catch(() => alert("복사 실패")); }
};

// [Global] 태그 클릭 시 주문창 이동 (Fix: 모듈 밖으로 노출)
window.triggerTagAction = function(productId) {
    // 1. 탭 이동
    const orderTab = document.querySelector('.menu-item[data-target="order-mgmt"]');
    if(orderTab) orderTab.click();

    // 2. 트리 펼치기 및 선택
    setTimeout(() => {
        const targetNode = document.querySelector(`.tree-node[data-id="${productId}"]`);
        if(targetNode) {
            // 부모 폴더들 다 열기
            let parent = targetNode.parentElement;
            while(parent) {
                if(parent.id === 'product-list') break;
                if(parent.style.display === 'none') {
                    parent.style.display = 'block';
                    const toggleBtn = parent.previousElementSibling;
                    if(toggleBtn && toggleBtn.classList.contains('tree-toggle')) toggleBtn.classList.add('open');
                }
                parent = parent.parentElement;
            }
            // 클릭 트리거 & 스크롤
            targetNode.click(); 
            targetNode.scrollIntoView({behavior: "smooth", block: "center"});
        } else {
            alert("해당 상품을 찾을 수 없습니다.");
        }
    }, 200); // 탭 전환 시간 고려
};


/* ==========================================================================
   [4] 데이터 불러오기 (상품)
   ========================================================================== */
async function loadProducts() {
    const listContainer = document.getElementById('product-list');
    if(listContainer) listContainer.innerHTML = "<div style='padding:20px; text-align:center'>로딩중...</div>";
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        let products = [];
        querySnapshot.forEach(doc => { products.push({ id: doc.id, ...doc.data() }); });
        allProductsData = products; 
        renderMainTree(products); 
        renderAdminList(products); 
    } catch (error) { console.error("Error loading products:", error); }
}

function renderMainTree(productsToRender) {
    const listContainer = document.getElementById('product-list');
    if(!listContainer) return;
    const tree = {};
    productsToRender.forEach(p => {
        const cat = p.category || "기타"; const comp = p.company || "미지정";
        if (!tree[cat]) tree[cat] = {}; if (!tree[cat][comp]) tree[cat][comp] = [];
        tree[cat][comp].push(p);
    });
    listContainer.innerHTML = ""; 
    const isSearchMode = (productsToRender.length < allProductsData.length) && (productsToRender.length > 0);
    const fixedOrder = ["전문의약품", "일반의약품", "의약외품"];
    const allCategories = Object.keys(tree);
    const sortedCategories = [ ...fixedOrder.filter(key => allCategories.includes(key)), ...allCategories.filter(key => !fixedOrder.includes(key)).sort() ];

    if(productsToRender.length === 0) { listContainer.innerHTML = "<div style='padding:20px; text-align:center;'>결과 없음</div>"; return; }

    sortedCategories.forEach(categoryName => {
        const catDiv = document.createElement("div");
        catDiv.className = "tree-node tree-depth-0 tree-toggle"; catDiv.textContent = categoryName;
        const catChildContainer = document.createElement("div");
        catChildContainer.style.display = isSearchMode ? "block" : "none"; if(isSearchMode) catDiv.classList.add('open');
        catDiv.addEventListener("click", () => { catDiv.classList.toggle("open"); catChildContainer.style.display = catChildContainer.style.display === "none" ? "block" : "none"; });
        listContainer.appendChild(catDiv); listContainer.appendChild(catChildContainer);
        const companies = tree[categoryName];
        Object.keys(companies).sort().forEach(companyName => {
            const compDiv = document.createElement("div");
            compDiv.className = "tree-node tree-depth-1 tree-toggle"; compDiv.textContent = companyName;
            const compChildContainer = document.createElement("div");
            compChildContainer.style.display = isSearchMode ? "block" : "none"; if(isSearchMode) compDiv.classList.add('open');
            compDiv.addEventListener("click", (e) => { e.stopPropagation(); compDiv.classList.toggle("open"); compChildContainer.style.display = compChildContainer.style.display === "none" ? "block" : "none"; });
            catChildContainer.appendChild(compDiv); catChildContainer.appendChild(compChildContainer);
            const itemList = companies[companyName];
            itemList.sort((a, b) => a.name.localeCompare(b.name));
            itemList.forEach(item => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "tree-node tree-depth-2"; itemDiv.setAttribute("data-id", item.id);
                let displayName = item.name;
                if(item.stock === false) displayName = `<span style="color:red">[품절]</span> ${item.name}`;
                itemDiv.innerHTML = displayName;
                itemDiv.addEventListener("click", () => focusProductInTree(item));
                compChildContainer.appendChild(itemDiv);
            });
        });
    });
}
const mainSearchInput = document.getElementById('main-search-input');
if(mainSearchInput) {
    mainSearchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase().trim();
        if(keyword.length > 0) { const orderTab = document.querySelector('.menu-item[data-target="order-mgmt"]'); if(orderTab) orderTab.click(); } 
        else { renderMainTree(allProductsData); return; }
        const filtered = allProductsData.filter(p => (p.name && p.name.toLowerCase().includes(keyword)) || (p.company && p.company.toLowerCase().includes(keyword)) || (p.category && p.category.toLowerCase().includes(keyword)));
        renderMainTree(filtered);
    });
}
function focusProductInTree(product, optionId = null) {
    if(currentPhotoReqId) {
        if(confirm(`선택한 사진 요청을 '${product.name}' 상품과 매칭하시겠습니까?`)) {
            displayOrderForm(product, optionId, currentPhotoReqId);
            return;
        }
    }
    displayOrderForm(product, optionId);
    setTimeout(() => {
        const targetNode = document.querySelector(`.tree-node[data-id="${product.id}"]`);
        if(targetNode) {
            document.querySelectorAll('.tree-node.active-node').forEach(n => n.classList.remove('active-node'));
            targetNode.classList.add('active-node');
            let parent = targetNode.parentElement;
            while(parent) {
                if(parent.id === 'product-list') break;
                if(parent.style.display === 'none') { parent.style.display = 'block'; const toggleBtn = parent.previousElementSibling; if(toggleBtn) toggleBtn.classList.add('open'); }
                parent = parent.parentElement;
            }
            targetNode.scrollIntoView({behavior: "smooth", block: "center"});
        }
    }, 100);
}

/* ==========================================================================
   [5] 상세 화면 & 장바구니
   ========================================================================== */
function displayOrderForm(item, targetOptionId = null, photoReqId = null) {
    currentProduct = item; currentQty = 1; 
    document.getElementById('detail-empty').style.display = 'none';
    document.getElementById('detail-content').style.display = 'flex'; 
    document.getElementById('detail-category').textContent = item.category;
    document.getElementById('detail-name').textContent = item.name;
    document.getElementById('detail-company').textContent = item.company;
    const header = document.querySelector('.order-header');
    if(photoReqId) {
        header.style.backgroundColor = "#fff8e1"; header.style.border = "1px solid #f39c12"; header.style.padding = "10px";
        header.setAttribute('data-photo-req-id', photoReqId); 
        document.getElementById('detail-name').innerHTML = `${item.name} <span style="font-size:0.8rem; color:#e67e22;">(사진 매칭중)</span>`;
    } else {
        header.style.backgroundColor = "transparent"; header.style.border = "none"; header.removeAttribute('data-photo-req-id');
    }
    const optionContainer = document.getElementById('option-list-container');
    optionContainer.innerHTML = ""; 
    const options = item.options || []; 
    if(options.length === 0) { optionContainer.innerHTML = "<div style='padding:20px; color:#aaa; text-align:center;'>옵션 없음</div>"; document.getElementById('order-total-price').textContent = "0원"; return; }

    options.forEach((opt, index) => {
        const card = document.createElement('div'); card.className = 'option-card';
        const count = opt.count || 1; const unitPrice = opt.price / count;
        card.innerHTML = `<div style="flex:1;"><div class="option-name">${opt.name}</div></div><div style="text-align:right;"><div class="option-price">${Number(opt.price).toLocaleString()}원</div>${count > 1 ? `<div style="font-size:0.8rem; color:#3498db;">(@ ${Math.round(unitPrice).toLocaleString()}원)</div>` : ''}</div>`;
        let isSelected = false;
        if(targetOptionId) { if(opt.id === targetOptionId) isSelected = true; } else { if(index === 0) isSelected = true; }
        if(isSelected) { card.classList.add('selected'); currentOptionPrice = Number(opt.price); currentOptionId = opt.id; }
        card.addEventListener('click', () => {
            document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            currentQty = 1; document.getElementById('order-qty').value = 1;
            currentOptionPrice = Number(opt.price); currentOptionId = opt.id; updateTotalPrice();
        });
        optionContainer.appendChild(card);
    });
    if(options.length > 0 && !targetOptionId) { currentOptionPrice = Number(options[0].price); currentOptionId = options[0].id; }
    document.getElementById('order-qty').value = 1; updateTotalPrice();
}
function updateTotalPrice() {
    const total = currentOptionPrice * currentQty;
    document.getElementById('order-total-price').textContent = total.toLocaleString() + "원";
}
document.getElementById('qty-plus').addEventListener('click', () => { currentQty++; document.getElementById('order-qty').value = currentQty; updateTotalPrice(); });
document.getElementById('qty-minus').addEventListener('click', () => { if(currentQty > 1) currentQty--; document.getElementById('order-qty').value = currentQty; updateTotalPrice(); });
document.getElementById('order-qty').addEventListener('input', function() { let val = parseInt(this.value); if(isNaN(val) || val < 1) val = 1; currentQty = val; updateTotalPrice(); });

const btnAddCart = document.getElementById('btn-add-cart');
if(btnAddCart) btnAddCart.addEventListener('click', async () => {
    if(!currentProduct || !currentOptionId) return;
    const selectedOptionEl = document.querySelector('.option-card.selected');
    const optionName = selectedOptionEl ? selectedOptionEl.querySelector('.option-name').textContent : "기본옵션";
    const header = document.querySelector('.order-header');
    const photoReqId = header.getAttribute('data-photo-req-id'); 
    const newItem = { cartId: Date.now(), optionId: currentOptionId, product: currentProduct, optionName: optionName, qty: currentQty, unitPrice: currentOptionPrice, totalPrice: currentOptionPrice * currentQty, photoReqId: photoReqId };
    const existingIndex = cartItems.findIndex(i => i.optionId === currentOptionId && i.photoReqId === photoReqId);
    if(existingIndex !== -1) { cartItems[existingIndex].qty += currentQty; cartItems[existingIndex].totalPrice = cartItems[existingIndex].unitPrice * cartItems[existingIndex].qty; } else { cartItems.push(newItem); }
    renderCart(currentOptionId);
    if(photoReqId) {
        try {
            await updateDoc(doc(db, "photo_requests", photoReqId), { status: "processed", matchedProduct: currentProduct.name, completedAt: new Date() });
            currentPhotoReqId = null; header.style.backgroundColor = "transparent"; header.style.border = "none"; header.removeAttribute('data-photo-req-id');
            document.getElementById('detail-name').textContent = currentProduct.name;
            alert("사진 요청 처리 완료");
        } catch(e) { console.error("사진 업데이트 실패:", e); }
    }
});
function resetOrderDetail() {
    document.getElementById('detail-empty').style.display = 'block';
    document.getElementById('detail-content').style.display = 'none';
    currentProduct = null; currentQty = 1; currentOptionPrice = 0; currentOptionId = null;
    const header = document.querySelector('.order-header');
    if(header) { header.style.backgroundColor = "transparent"; header.style.border = "none"; header.removeAttribute('data-photo-req-id'); }
}
function renderCart(highlightId = null) {
    const cartList = document.getElementById('cart-list');
    cartList.innerHTML = ""; let totalAmount = 0;
    if(cartItems.length === 0) cartList.innerHTML = "<div style='padding:40px 20px; text-align:center; color:#ccc;'>비어있음</div>";
    cartItems.forEach((item, index) => {
        totalAmount += item.totalPrice;
        const div = document.createElement('div'); div.className = 'cart-item-card';
        if(highlightId && item.optionId === highlightId) div.classList.add('highlight');
        div.addEventListener('dblclick', () => { document.querySelector('.menu-item[data-target="order-mgmt"]').click(); focusProductInTree(item.product, item.optionId); });
        const photoIcon = item.photoReqId ? '<span style="font-size:0.8rem;">📷</span>' : '';
        div.innerHTML = `<div class="cart-item-left"><div class="cart-item-title">${item.product.name} ${photoIcon} <span style="font-size:0.85rem; color:#888;">(${item.product.company})</span></div><div class="cart-item-desc">${item.optionName}</div></div><div class="cart-item-right"><div class="cart-item-price">${item.totalPrice.toLocaleString()}원</div><div class="cart-item-qty">${item.qty}개</div></div><button class="cart-delete-btn" onclick="deleteCartItem(${index})" title="삭제">&times;</button>`;
        cartList.appendChild(div);
    });
    document.getElementById('cart-total-price').textContent = totalAmount.toLocaleString() + "원";
    document.getElementById('cart-count').textContent = cartItems.length;
}
window.deleteCartItem = function(index) { const card = document.querySelectorAll('.cart-item-card')[index]; deletedItemBackup = { item: cartItems[index], optionId: cartItems[index].optionId }; if(card) card.classList.add('deleting'); setTimeout(() => { cartItems.splice(index, 1); renderCart(); showUndoNotification(); }, 200); };
function showUndoNotification() { const undoArea = document.getElementById('undo-area'); undoArea.style.display = 'block'; if(undoTimeout) clearTimeout(undoTimeout); undoTimeout = setTimeout(() => { undoArea.style.display = 'none'; deletedItemBackup = null; }, 5000); }
if(document.getElementById('btn-undo')) document.getElementById('btn-undo').addEventListener('click', () => { if(deletedItemBackup) { cartItems.push(deletedItemBackup.item); renderCart(deletedItemBackup.optionId); document.getElementById('undo-area').style.display = 'none'; } });
if(document.getElementById('btn-order-complete')) {
    document.getElementById('btn-order-complete').addEventListener('click', async () => {
        if(cartItems.length === 0) return;
        if(!confirm(`총 ${cartItems.length}건 주문완료?`)) return;
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        try { await addDoc(collection(db, "order_history"), { date: dateStr, timestamp: now, items: cartItems }); cartItems = []; renderCart(); resetOrderDetail(); } catch(e) { console.error(e); alert("주문 저장 실패"); }
    });
}

/* ==========================================================================
   [6] 거래처 관리 (수정: 검색/편집/문자)
   ========================================================================== */
const supplierSearchInput = document.getElementById('supplier-search');
if(supplierSearchInput) {
    supplierSearchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase();
        const filtered = allSuppliersData.filter(sup => {
            const nameMatch = sup.name.toLowerCase().includes(keyword);
            const productMatch = sup.products && sup.products.some(p => p.name.toLowerCase().includes(keyword));
            return nameMatch || productMatch;
        });
        renderSupplierList(filtered);
    });
}
async function loadSuppliers() {
    const listContainer = document.getElementById('supplier-list');
    if(!listContainer) return;
    listContainer.innerHTML = "<div style='text-align:center;'>로딩중...</div>";
    try {
        const supSnapshot = await getDocs(collection(db, "suppliers"));
        let suppliers = []; supSnapshot.forEach(doc => suppliers.push({ id: doc.id, ...doc.data() }));
        const prodSnapshot = await getDocs(collection(db, "products"));
        const companyProductMap = {}; prodSnapshot.forEach(doc => { const p = { id: doc.id, ...doc.data() }; const comp = p.company || "미지정"; if(!companyProductMap[comp]) companyProductMap[comp] = []; companyProductMap[comp].push(p); });
        suppliers.forEach(sup => { sup.products = companyProductMap[sup.name] || []; });
        allSuppliersData = suppliers; 
        document.getElementById('sup-total-count').textContent = suppliers.length;
        renderSupplierList(suppliers);
    } catch (e) { console.error(e); }
}
// [Fix] 거래처 리스트 클릭 -> 상세폼 채우기 연결
function renderSupplierList(suppliersToRender) {
    const listContainer = document.getElementById('supplier-list');
    listContainer.innerHTML = "";
    if(suppliersToRender.length === 0) { listContainer.innerHTML = "<div style='text-align:center; padding:20px; color:#aaa;'>결과 없음</div>"; return; }
    suppliersToRender.sort((a, b) => a.name.localeCompare(b.name));
    suppliersToRender.forEach(sup => {
        const div = document.createElement('div'); div.className = 'supplier-card';
        let tagsHtml = "";
        const products = sup.products || [];
        products.slice(0, 10).forEach(p => tagsHtml += `<span class="product-tag-chip" onclick="event.stopPropagation(); triggerTagAction('${p.id}')">#${p.name}</span>`);
        if(products.length > 10) tagsHtml += `<span style="font-size:0.7rem; color:#888;">+${products.length - 10} more</span>`;
        if(products.length === 0) tagsHtml = `<span style="font-size:0.75rem; color:#ccc;">상품 없음</span>`;
        const smsBtn = sup.curManagerPhone ? `<button class="btn-sms-list" data-phone="${sup.curManagerPhone}" style="margin-left:5px; font-size:1rem; width:28px; height:28px; background:#2ecc71; border:none; border-radius:50%; color:white; cursor:pointer;">✉️</button>` : '';
        div.innerHTML = `<div class="sup-header"><div class="sup-name">${sup.name}</div></div><div class="sup-manager-info" style="display:flex; align-items:center;">👤 ${sup.curManagerName || '-'} (${sup.curManagerPhone || '-'}) ${smsBtn}</div><div class="sup-product-tags">${tagsHtml}</div>`;
        
        // ★ [중요] 클릭 이벤트 확실하게 연결
        div.addEventListener('click', () => {
            document.querySelectorAll('.supplier-card').forEach(c => c.classList.remove('active'));
            div.classList.add('active');
            fillSupplierForm(sup); // 상세 폼 채우기 실행
        });
        const btnSms = div.querySelector('.btn-sms-list');
        if(btnSms) btnSms.addEventListener('click', (e) => { e.stopPropagation(); handleSmsClick(sup.curManagerPhone); });
        listContainer.appendChild(div);
    });
}
function fillSupplierForm(sup) {
    currentSupplierId = sup.id;
    document.getElementById('supplier-form-title').textContent = `${sup.name} 수정`;
    document.getElementById('sup-name').value = sup.name || "";
    document.getElementById('sup-website').value = sup.website || "";
    document.getElementById('sup-site-id').value = sup.siteId || "";
    document.getElementById('sup-site-pw').value = sup.sitePw || "";
    document.getElementById('sup-site-pw').type = "password";
    document.getElementById('sup-cur-manager').value = sup.curManagerName || "";
    document.getElementById('sup-cur-phone').value = sup.curManagerPhone || "";
    document.getElementById('sup-prev-manager').value = sup.prevManagerName || "";
    document.getElementById('sup-prev-phone').value = sup.prevManagerPhone || "";
    document.getElementById('btn-delete-supplier').style.display = "block";
    let smsBtn = document.getElementById('btn-sms-cur');
    if(!smsBtn) {
        const container = document.getElementById('sup-cur-phone').parentNode;
        smsBtn = document.createElement('a'); smsBtn.id = 'btn-sms-cur';
        smsBtn.style.cssText = "display:none; align-items:center; justify-content:center; width:40px; background:#2ecc71; border-radius:4px; text-decoration:none; font-size:1.2rem; cursor:pointer;";
        smsBtn.innerText = "✉️";
        container.appendChild(smsBtn);
    }
    if(sup.curManagerPhone) { smsBtn.style.display = 'flex'; smsBtn.onclick = (e) => { e.preventDefault(); handleSmsClick(sup.curManagerPhone); }; } 
    else { smsBtn.style.display = 'none'; }
}

const btnNewSupplier = document.getElementById('btn-new-supplier');
if(btnNewSupplier) btnNewSupplier.addEventListener('click', () => { currentSupplierId = null; document.getElementById('supplier-form-title').textContent = "신규 등록"; document.querySelectorAll('input[id^="sup-"]').forEach(input => input.value = ""); document.getElementById('sup-name').focus(); document.getElementById('btn-delete-supplier').style.display = "none"; });
const btnSaveSupplier = document.getElementById('btn-save-supplier');
if(btnSaveSupplier) btnSaveSupplier.addEventListener('click', async () => {
    const name = document.getElementById('sup-name').value;
    if(!name) return;
    const data = { name: name, website: document.getElementById('sup-website').value, siteId: document.getElementById('sup-site-id').value, sitePw: document.getElementById('sup-site-pw').value, curManagerName: document.getElementById('sup-cur-manager').value, curManagerPhone: document.getElementById('sup-cur-phone').value, prevManagerName: document.getElementById('sup-prev-manager').value, prevManagerPhone: document.getElementById('sup-prev-phone').value };
    if(currentSupplierId) await deleteDoc(doc(db, "suppliers", currentSupplierId));
    await addDoc(collection(db, "suppliers"), data);
    alert("저장완료"); loadSuppliers(); btnNewSupplier.click();
});
const btnDeleteSupplier = document.getElementById('btn-delete-supplier');
if(btnDeleteSupplier) btnDeleteSupplier.addEventListener('click', async () => { if(currentSupplierId && confirm("삭제?")) { await deleteDoc(doc(db, "suppliers", currentSupplierId)); alert("삭제됨"); loadSuppliers(); btnNewSupplier.click(); } });
document.getElementById('btn-toggle-pw').addEventListener('click', () => { const pwInput = document.getElementById('sup-site-pw'); if(pwInput.type === "password") { if(prompt("PIN (0000)") === "0000") pwInput.type = "text"; } else pwInput.type = "password"; });
document.getElementById('btn-manager-handover').addEventListener('click', () => { const cur = document.getElementById('sup-cur-manager').value; if(cur && confirm("이관?")) { document.getElementById('sup-prev-manager').value = cur; document.getElementById('sup-cur-manager').value = ""; } });
window.triggerTagAction = function(productId) { document.querySelector('.menu-item[data-target="order-mgmt"]').click(); setTimeout(() => { const targetNode = document.querySelector(`.tree-node[data-id="${productId}"]`); if(targetNode) targetNode.click(); }, 100); };


/* ==========================================================================
   [7] 하단 로그, 달력, 사진 등
   ========================================================================== */
// (기존 사진, 달력, 로그 함수들 유지 - 생략 없이)
function subscribeToRecentLogs() {
    const logContainer = document.getElementById('completed-order-list');
    const q = query(collection(db, "order_history"), orderBy("timestamp", "desc"), limit(50));
    onSnapshot(q, (snapshot) => {
        logContainer.innerHTML = "";
        if(snapshot.empty) { logContainer.innerHTML = '<div style="color:#aaa; padding:10px;">기록 없음</div>'; return; }
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const dateObj = data.timestamp.toDate();
            const timeStr = `${dateObj.getMonth()+1}/${dateObj.getDate()} ${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
            data.items.forEach(item => {
                const div = document.createElement('div'); div.className = 'log-item';
                // [Fix] 로그 표시 개선 (제약사, 옵션명, 수량 명확히)
                div.innerHTML = `<div style="display:flex; align-items:center;"><span class="log-time">[${timeStr}]</span><strong>${item.product.name}</strong><span style="color:#888; font-size:0.85rem; margin-left:4px;">(${item.product.company})</span><span style="color:#666; margin-left:5px;">[${item.optionName}] x ${item.qty}</span></div><div><span class="log-status">완료</span><button class="btn-log-restore">취소</button></div>`;
                div.querySelector('.btn-log-restore').addEventListener('click', async () => { if(confirm("취소하시겠습니까?")) { cartItems.push(item); renderCart(item.optionId); await deleteDoc(doc(db, "order_history", docSnap.id)); } });
                logContainer.appendChild(div);
            });
        });
    });
}
/* ==========================================================================
   [수정] 달력 그리기 (안전장치 추가)
   ========================================================================== */
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthEl = document.getElementById('cal-current-month');
    
    if(!grid || !monthEl) return; // 요소가 없으면 중단

    grid.innerHTML = "";
    
    const year = calDate.getFullYear();
    const month = calDate.getMonth(); 
    monthEl.textContent = `${year}.${String(month + 1).padStart(2, '0')}`;

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isThisMonth = (today.getFullYear() === year && today.getMonth() === month);

    // 빈 칸 채우기
    for(let i=0; i<firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'calendar-date empty';
        grid.appendChild(div);
    }

    // 날짜 채우기
    for(let i=1; i<=lastDate; i++) {
        const div = document.createElement('div');
        div.className = 'calendar-date';
        div.textContent = i;
        
        const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        div.setAttribute('data-date', dateStr);

        if(isThisMonth && today.getDate() === i) div.classList.add('today');
        if(selectedDateStr === dateStr) div.classList.add('selected');

        div.addEventListener('click', () => {
            document.querySelectorAll('.calendar-date').forEach(d => d.classList.remove('selected'));
            div.classList.add('selected');
            selectedDateStr = dateStr;
            loadHistoryByDate(dateStr);
        });
        grid.appendChild(div);
    }
    
    // 데이터 점 찍기
    const startStr = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const endStr = `${year}-${String(month+1).padStart(2,'0')}-31`;
    
    const q = query(collection(db, "order_history"), where("date", ">=", startStr), where("date", "<=", endStr));
    getDocs(q).then(snap => {
        const dates = new Set();
        snap.forEach(d => dates.add(d.data().date));
        document.querySelectorAll('.calendar-date').forEach(el => {
            if(dates.has(el.getAttribute('data-date'))) el.classList.add('has-data');
        });
    });
}
const btnCalPrev = document.getElementById('cal-prev'); const btnCalNext = document.getElementById('cal-next');
if(btnCalPrev) btnCalPrev.onclick = () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); };
if(btnCalNext) btnCalNext.onclick = () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); };

async function loadHistoryByDate(dateStr) {
    const listContainer = document.getElementById('history-list'); const titleEl = document.getElementById('history-title');
    titleEl.textContent = `${dateStr} 주문 상세 내역`; listContainer.innerHTML = "<div style='text-align:center; margin-top:50px;'>로딩중...</div>";
    try {
        const q = query(collection(db, "order_history"), where("date", "==", dateStr));
        const querySnapshot = await getDocs(q);
        listContainer.innerHTML = "";
        if(querySnapshot.empty) { listContainer.innerHTML = "<div style='text-align:center; color:#ccc; margin-top:50px;'>기록 없음</div>"; return; }
        let historyData = [];
        querySnapshot.forEach(doc => historyData.push({ id: doc.id, ...doc.data() }));
        historyData.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);
        historyData.forEach(data => {
            const items = data.items; const card = document.createElement('div'); card.className = 'history-card';
            const dateObj = data.timestamp.toDate(); 
            const timeStr = `${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
            let itemsHtml = "";
            items.forEach(item => { itemsHtml += `<div class="history-item-row"><span>${item.product.name} <span style="color:#888; font-size:0.85rem;">(${item.product.company})</span> <span style="color:#666;">[${item.optionName}] x ${item.qty}</span></span></div>`; });
            card.innerHTML = `<div class="history-time">⏰ ${timeStr} (총 ${items.length}품목)</div><div style="border-top:1px solid #eee; margin-top:5px; padding-top:5px;">${itemsHtml}</div>`;
            listContainer.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

const btnCamera = document.getElementById('btn-camera-floating');
const cameraInput = document.getElementById('file-input-camera'); 
const inputGallery = document.getElementById('file-input-gallery');
const loadingSpinner = document.getElementById('loading-spinner');
const sourceModal = document.getElementById('source-select-modal');
function openSourceModal() { if(sourceModal) sourceModal.style.display = 'flex'; }
if(btnCamera) btnCamera.addEventListener('click', openSourceModal);
if(document.getElementById('btn-select-camera')) document.getElementById('btn-select-camera').onclick = () => { sourceModal.style.display = 'none'; if(cameraInput) cameraInput.click(); };
if(document.getElementById('btn-select-gallery')) document.getElementById('btn-select-gallery').onclick = () => { sourceModal.style.display = 'none'; if(inputGallery) inputGallery.click(); };
if(document.getElementById('btn-select-cancel')) document.getElementById('btn-select-cancel').onclick = () => { sourceModal.style.display = 'none'; };
async function handleFileUpload(e) {
    const file = e.target.files[0]; if(!file) return;
    window.tempUploadFile = file; 
    const reader = new FileReader();
    reader.onload = (event) => { const img = document.getElementById('upload-preview-img'); if(img) img.src = event.target.result; };
    reader.readAsDataURL(file);
    document.getElementById('upload-note').value = "";
    document.getElementById('upload-confirm-modal').style.display = 'flex';
    e.target.value = '';
}
if(cameraInput) cameraInput.addEventListener('change', handleFileUpload);
if(inputGallery) inputGallery.addEventListener('change', handleFileUpload);
if(document.getElementById('btn-upload-cancel')) document.getElementById('btn-upload-cancel').addEventListener('click', () => { document.getElementById('upload-confirm-modal').style.display = 'none'; window.tempUploadFile = null; });
if(document.getElementById('btn-upload-confirm')) {
    const btn = document.getElementById('btn-upload-confirm');
    const newBtn = btn.cloneNode(true); btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', async () => {
        const file = window.tempUploadFile; if(!file) return;
        const note = document.getElementById('upload-note').value;
        document.getElementById('upload-confirm-modal').style.display = 'none';
        const options = { maxSizeMB: 0.3, maxWidthOrHeight: 800, useWebWorker: true };
        try {
            if(loadingSpinner) loadingSpinner.style.display = 'flex';
            const compressedFile = await imageCompression(file, options);
            const storageRef = ref(storage, `photo_requests/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, compressedFile);
            const downloadURL = await getDownloadURL(storageRef);
            await addDoc(collection(db, "photo_requests"), { imageUrl: downloadURL, timestamp: new Date(), status: 'pending', note: note });
            if(loadingSpinner) loadingSpinner.style.display = 'none';
            alert("전송 완료");
        } catch(error) { console.error(error); if(loadingSpinner) loadingSpinner.style.display = 'none'; alert("오류"); }
    });
}
function subscribeToPhotoRequests() {
    const queueContainer = document.getElementById('photo-grid'); 
    if(!queueContainer) return;
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const q = query(collection(db, "photo_requests"), where("timestamp", ">", threeDaysAgo), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        queueContainer.innerHTML = "";
        if(snapshot.empty) { queueContainer.innerHTML = "<div style='grid-column:1/-1; text-align:center; color:#ccc; padding:50px;'>요청 내역이 없습니다.</div>"; return; }
        let photoList = [];
        snapshot.forEach(docSnap => photoList.push({ id: docSnap.id, ...docSnap.data(), docSnap: docSnap }));
        photoList.sort((a, b) => {
            const statusOrder = { 'pending': 1, 'hold': 2, 'processed': 3 };
            if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
            return b.timestamp.seconds - a.timestamp.seconds; 
        });
        photoList.forEach(data => {
            const div = document.createElement('div');
            let statusClass = 'pending'; if(data.status === 'hold') statusClass = 'hold'; if(data.status === 'processed') statusClass = 'done';
            div.className = `order-book-item ${statusClass}`;
            const reqTime = formatShortTime(data.timestamp);
            const doneTime = data.completedAt ? formatShortTime(data.completedAt) : "";
            const noteHtml = data.note ? `<div class="photo-note-label">${data.note}</div>` : "";
            div.innerHTML = `<img src="${data.imageUrl}"><div class="photo-time-label time-top">요청: ${reqTime}</div>${statusClass === 'done' ? `<div class="photo-time-label time-bottom">완료: ${doneTime}</div>` : ''}${noteHtml}`;
            div.addEventListener('click', () => showPhotoViewer(data.id, data.imageUrl, data.status, data.note));
            queueContainer.appendChild(div);
        });
    });
}
// [수정] 사진 뷰어 표시 (버튼 생성 로직 강화)
// [수정] 사진 뷰어 표시 (버튼 생성 로직 강화)
function showPhotoViewer(docId, imageUrl, currentStatus, note) {
    let viewer = document.getElementById('photo-viewer-modal');
    
    // 뷰어 HTML 내용 갱신
    viewer.innerHTML = `
        <div style="position:relative; max-width:90%; max-height:70%;">
            <img id="viewer-img" src="${imageUrl}" style="max-width:100%; max-height:70vh; border-radius:8px;">
            <button id="viewer-close" style="position:absolute; top:-40px; right:0; background:none; border:none; color:white; font-size:2.5rem; cursor:pointer;">&times;</button>
        </div>
        <div id="viewer-note" style="background:rgba(255,255,255,0.9); padding:10px 20px; border-radius:20px; margin-top:15px; font-weight:bold; color:#333; max-width:90%; text-align:center; display:${note ? 'block' : 'none'}">
            📝 메모: ${note || ''}
        </div>
        <div id="viewer-buttons" style="margin-top:15px; display:flex; gap:10px; flex-wrap:wrap; justify-content:center;"></div>
    `;

    const btnContainer = viewer.querySelector('#viewer-buttons');

    // 버튼 생성 헬퍼 함수
    const createBtn = (text, color, action) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `padding:12px 25px; font-size:1rem; border-radius:30px; border:none; cursor:pointer; font-weight:bold; color:white; background-color:${color}; box-shadow:0 4px 10px rgba(0,0,0,0.3); min-width:100px;`;
        btn.onclick = action;
        return btn;
    };

    // 상태별 버튼 추가
    if(currentStatus === 'pending') {
        btnContainer.appendChild(createBtn('✅ 주문완료', '#27ae60', () => updatePhotoStatus(docId, 'processed')));
        btnContainer.appendChild(createBtn('🟠 보류/메모', '#f39c12', () => updatePhotoStatus(docId, 'hold', true)));
    } 
    else if(currentStatus === 'hold') {
        btnContainer.appendChild(createBtn('✅ 주문완료', '#27ae60', () => updatePhotoStatus(docId, 'processed')));
        btnContainer.appendChild(createBtn('↩️ 대기로 복구', '#34495e', () => updatePhotoStatus(docId, 'pending')));
    }
    else { // processed
        btnContainer.appendChild(createBtn('↩️ 주문취소 (복구)', '#e74c3c', () => updatePhotoStatus(docId, 'pending')));
    }

    // 닫기 이벤트 연결
    viewer.querySelector('#viewer-close').onclick = () => viewer.style.display = 'none';
    viewer.onclick = (e) => { if(e.target === viewer) viewer.style.display = 'none'; };
    
    viewer.style.display = 'flex';
}

// [수정] 상태 업데이트 (보류 사유 입력 포함)
async function updatePhotoStatus(docId, newStatus, requireReason = false) {
    let updateData = { status: newStatus };
    
    if(requireReason) {
        const reason = prompt("보류 사유를 입력하세요 (예: 재고 있음, 품절)");
        if(reason === null) return; // 취소 누르면 중단
        if(reason) updateData.note = reason; // 메모 업데이트
    }
    
    if(newStatus === 'processed') updateData.completedAt = new Date();
    else if(newStatus === 'pending') updateData.completedAt = null;

    try {
        await updateDoc(doc(db, "photo_requests", docId), updateData);
        document.getElementById('photo-viewer-modal').style.display = 'none'; // 닫기
    } catch(e) {
        console.error(e);
        alert("처리 중 오류가 발생했습니다.");
    }
}

function renderAdminList(productsToRender) {
    const adminListContainer = document.getElementById('admin-product-list');
    const countEl = document.getElementById('admin-list-count');
    if(!adminListContainer) return;
    adminListContainer.innerHTML = ""; 
    if(countEl) countEl.textContent = `(${productsToRender.length}개)`;
    if(productsToRender.length === 0) { adminListContainer.innerHTML = "<li style='padding:20px; text-align:center; color:#ccc;'>검색 결과가 없습니다.</li>"; return; }
    productsToRender.sort((a, b) => a.name.localeCompare(b.name));
    productsToRender.forEach(item => {
        const li = document.createElement("li");
        li.style.padding = "15px"; li.style.borderBottom = "1px solid #eee"; li.style.display = "flex"; li.style.justifyContent = "space-between"; li.style.alignItems = "flex-start";
        let optionsHtml = item.options && item.options.length > 0 ? item.options.map(opt => `<span class="admin-option-tag">#${opt.name}</span>`).join("") : `<span style="font-size:0.75rem; color:#ccc;">옵션 없음</span>`;
        li.innerHTML = `<div style="flex:1;"><div style="font-weight:bold; color:#333; margin-bottom:5px;"><span style="color:#2980b9;">[${item.category}]</span> <span style="color:#aaa;">/</span> ${item.company} <span style="color:#aaa;">/</span> <span style="font-size:1.05rem;">${item.name}</span></div><div style="line-height:1.5;">${optionsHtml}</div></div><div style="display:flex; gap:5px; margin-left:10px;"><button class="btn-edit-product" style="background:#f39c12; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">수정</button><button class="btn-real-delete" data-id="${item.id}" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">삭제</button></div>`;
        li.querySelector('.btn-edit-product').addEventListener('click', () => { document.querySelector('.menu-item[data-target="product-mgmt"]').click(); startEditMode(item); });
        adminListContainer.appendChild(li);
    });
    document.querySelectorAll('.btn-real-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => { if(confirm("영구 삭제?")) { await deleteDoc(doc(db, "products", e.target.getAttribute('data-id'))); loadProducts(); } });
    });
}
const adminSearchInput = document.getElementById('admin-product-search');
if(adminSearchInput) {
    adminSearchInput.addEventListener('input', (e) => {
        const keyword = e.target.value.toLowerCase();
        const filtered = allProductsData.filter(p => p.name.toLowerCase().includes(keyword) || p.company.toLowerCase().includes(keyword) || p.category.toLowerCase().includes(keyword));
        renderAdminList(filtered);
    });
}
// [수정] 수정 모드 진입 (총액 -> 단가 변환 표시)
async function startEditMode(item) {
    editingProductId = item.id; 
    
    // 거래처 목록 로드 대기
    await loadSupplierDropdown();
    
    document.getElementById('reg-category').value = item.category;
    document.getElementById('reg-company').value = item.company;
    document.getElementById('reg-name').value = item.name;
    
    const container = document.getElementById('reg-options-container');
    container.innerHTML = ""; 
    
    if(item.options && item.options.length > 0) {
        item.options.forEach(opt => {
            const count = Number(opt.count) || 1;
            const totalPrice = Number(opt.price);
            const unitPrice = Math.round(totalPrice / count); // 단가 계산
            
            addOptionRow(opt.name, count, unitPrice);
        });
    } else {
        addOptionRow(); 
    }
    
    const btnReg = document.getElementById('btn-register');
    btnReg.textContent = "상품 수정완료"; 
    btnReg.style.backgroundColor = "#f39c12"; 
    
    const btnCancel = document.getElementById('btn-cancel-edit');
    if(btnCancel) btnCancel.style.display = "inline-block";

    document.getElementById('product-form-body').scrollTop = 0;
}
const btnCancelEdit = document.getElementById('btn-cancel-edit');
if(btnCancelEdit) {
    btnCancelEdit.addEventListener('click', () => {
        editingProductId = null; document.getElementById('reg-name').value = ""; document.getElementById('reg-company').value = "";
        document.getElementById('reg-options-container').innerHTML = ""; addOptionRow();
        const btnReg = document.getElementById('btn-register'); btnReg.textContent = "상품 등록하기"; btnReg.style.backgroundColor = "#27ae60";
        btnCancelEdit.style.display = "none";
    });
}
// [수정] 상품 저장 버튼 (단가 * 입수량 = 총액 저장)
const btnRegister = document.getElementById('btn-register');
if(btnRegister) {
    // 기존 리스너 중복 방지를 위해 복제 후 교체
    const newBtn = btnRegister.cloneNode(true);
    btnRegister.parentNode.replaceChild(newBtn, btnRegister);

    newBtn.addEventListener('click', async () => {
        const cat = document.getElementById('reg-category').value;
        const comp = document.getElementById('reg-company').value;
        const name = document.getElementById('reg-name').value;
        
        if(!cat || !comp || !name) { alert("기본 정보를 입력해주세요."); return; }

        const optionRows = document.querySelectorAll('.option-input-row');
        const options = [];
        
        optionRows.forEach(row => {
            const optName = row.querySelector('.opt-name').value;
            const optCount = row.querySelector('.opt-count').value;
            const rawPrice = row.querySelector('.opt-price').value.replace(/,/g, '');
            
            const unitPrice = Number(rawPrice); // 입력한 단가
            const count = Number(optCount) || 1; // 입수량
            const totalPrice = unitPrice * count; // ★ 총액 계산
            
            if(optName && unitPrice) {
                options.push({
                    id: Date.now() + Math.random().toString(36).substr(2, 5), 
                    name: optName, 
                    price: totalPrice, // DB에는 총액 저장
                    count: count 
                });
            }
        });

        if(options.length === 0) { alert("적어도 하나의 옵션을 입력해주세요."); return; }

        const productData = { 
            category: cat, company: comp, name: name, stock: true, options: options, 
            code: Date.now().toString() 
        };

        try {
            if(editingProductId) {
                await updateDoc(doc(db, "products", editingProductId), productData);
                alert("상품이 수정되었습니다.");
                editingProductId = null; 
                newBtn.textContent = "상품 등록하기"; 
                newBtn.style.backgroundColor = "#27ae60";
                
                const btnCancel = document.getElementById('btn-cancel-edit');
                if(btnCancel) btnCancel.style.display = "none";
            } else {
                await addDoc(collection(db, "products"), productData);
                alert("상품이 등록되었습니다!");
            }
            
            // 폼 초기화
            document.getElementById('reg-name').value = "";
            document.getElementById('reg-options-container').innerHTML = "";
            addOptionRow(); 
            loadProducts(); 
            
        } catch(e) { console.error("저장 실패:", e); }
    });
}
async function loadSupplierDropdown() {
    const select = document.getElementById('reg-company');
    if(!select) return;
    try {
        const supSnapshot = await getDocs(collection(db, "suppliers"));
        let suppliers = []; supSnapshot.forEach(doc => suppliers.push(doc.data()));
        suppliers.sort((a, b) => a.name.localeCompare(b.name));
        let optionsHtml = '<option value="">거래처를 선택하세요</option>';
        suppliers.forEach(data => { optionsHtml += `<option value="${data.name}">${data.name}</option>`; });
        select.innerHTML = optionsHtml;
    } catch(e) { console.error(e); }
}
// [수정] 옵션 행 추가 (입수량, 단가 입력)
window.addOptionRow = function(name="", count=1, price="") {
    const container = document.getElementById('reg-options-container');
    const div = document.createElement('div');
    div.className = 'option-input-row';
    
    // 여기서 price는 '단가'입니다.
    let displayPrice = price ? Number(price).toLocaleString() : "";
    
    div.innerHTML = `
        <input type="text" class="opt-name" placeholder="옵션명 (예: 1박스)" value="${name}" style="flex:2;">
        <input type="number" class="opt-count" placeholder="입수량" value="${count}" style="flex:1; text-align:center;">
        <input type="text" class="opt-price" placeholder="단가 (1개 가격)" value="${displayPrice}" style="flex:1.5; text-align:right;">
        <button class="btn-remove-row" onclick="this.parentElement.remove()">-</button>
    `;
    
    // 단가 입력 시 콤마 자동 처리
    div.querySelector('.opt-price').addEventListener('input', function(e) {
        let val = e.target.value.replace(/[^0-9]/g, '');
        if(val) { e.target.value = Number(val).toLocaleString(); } 
        else { e.target.value = ""; }
    });

    container.appendChild(div);
};
if(document.getElementById('btn-add-option-row')) document.getElementById('btn-add-option-row').addEventListener('click', () => addOptionRow());

// 탭 전환
const menuItems = document.querySelectorAll('.menu-item');
const pages = document.querySelectorAll('.content-group');
menuItems.forEach(item => {
    item.addEventListener('click', () => {
        menuItems.forEach(menu => menu.classList.remove('active'));
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        pages.forEach(page => page.style.display = 'none');
        const targetPage = document.getElementById(`page-${targetId}`);
        if (targetPage) {
            const isFlexPage = ['product-mgmt', 'history-mgmt', 'order-mgmt', 'supplier-mgmt', 'order-book'].includes(targetId);
            targetPage.style.display = isFlexPage ? 'flex' : 'block';
            if(['product-mgmt', 'history-mgmt', 'supplier-mgmt', 'order-book'].includes(targetId)) targetPage.style.flexDirection = 'column';
        }
        if(targetId === 'supplier-mgmt') loadSuppliers(); 
        if(targetId === 'history-mgmt') { calDate = new Date(); renderCalendar(); loadHistoryByDate(`${calDate.getFullYear()}-${String(calDate.getMonth()+1).padStart(2,'0')}-${String(calDate.getDate()).padStart(2,'0')}`); }
        if(targetId === 'product-mgmt') { loadSupplierDropdown(); if(!editingProductId && document.getElementById('reg-options-container').children.length === 0) addOptionRow(); }
        window.scrollTo(0, 0); 
    });
});

/* ==========================================================================
   [추가] 거래처 퀵 등록 기능 (누락분 복구)
   ========================================================================== */
const btnQuickSupOpen = document.getElementById('btn-quick-sup-open');
const quickSupModal = document.getElementById('quick-sup-modal');
const btnQuickSupCancel = document.getElementById('btn-quick-sup-cancel');
const btnQuickSupSave = document.getElementById('btn-quick-sup-save');

// 1. 퀵 등록 모달 열기
if (btnQuickSupOpen && quickSupModal) {
    btnQuickSupOpen.addEventListener('click', (e) => {
        e.preventDefault(); // 버튼 기본 동작 방지
        quickSupModal.style.display = 'flex';
        document.getElementById('quick-sup-name').value = ''; // 입력창 초기화
        document.getElementById('quick-sup-name').focus(); // 포커스
    });
}

// 2. 취소 (닫기)
if (btnQuickSupCancel && quickSupModal) {
    btnQuickSupCancel.addEventListener('click', () => {
        quickSupModal.style.display = 'none';
    });
}

// 3. 저장 (등록)
// 3. 퀵 등록 저장 (반품 모달 연동 추가)
if (btnQuickSupSave) {
    const newBtn = btnQuickSupSave.cloneNode(true);
    btnQuickSupSave.parentNode.replaceChild(newBtn, btnQuickSupSave);

    newBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('quick-sup-name');
        const name = nameInput.value.trim();

        if (!name) {
            alert("거래처 이름을 입력해주세요.");
            return;
        }

        try {
            // DB 저장
            await addDoc(collection(db, "suppliers"), { name: name });
            alert("거래처가 등록되었습니다.");

            // 모달 닫기
            if(quickSupModal) quickSupModal.style.display = 'none';
            nameInput.value = "";

            // 1) 상품 등록창 드롭다운 갱신
            await loadSupplierDropdown(); 
            const regSelect = document.getElementById('reg-company');
            if (regSelect) regSelect.value = name; // 자동 선택

            // 2) 거래처 관리 리스트 갱신
            await loadSuppliers();        

            // 3) [Fix] 반품 등록창 드롭다운 갱신 (여기도 바로 반영!)
            const retSelect = document.getElementById('ret-supplier');
            if(retSelect) {
                const snap = await getDocs(collection(db, "suppliers"));
                let suppliers = [];
                snap.forEach(doc => suppliers.push(doc.data().name));
                suppliers.sort((a, b) => a.localeCompare(b)); // 정렬
                
                let html = '<option value="">거래처 선택</option>';
                suppliers.forEach(supName => html += `<option value="${supName}">${supName}</option>`);
                retSelect.innerHTML = html;
                retSelect.value = name; // 방금 등록한거 자동 선택
            }

        } catch (e) {
            console.error("거래처 등록 실패:", e);
            alert("등록 중 오류가 발생했습니다.");
        }
    });
}

/* ==========================================================================
   [13] 반품 관리 (Return Management)
   ========================================================================== */
/* ==========================================================================
   [수정] 반품 등록 모달 (사진 첨부 & 미리보기 추가)
   ========================================================================== */
const btnOpenRetModal = document.getElementById('btn-open-return-modal');
const retModal = document.getElementById('return-register-modal');
const btnRetSave = document.getElementById('btn-ret-save');
const btnRetCancel = document.getElementById('btn-ret-cancel');
const retImgInput = document.getElementById('ret-img-input');
const retImgPreview = document.getElementById('ret-img-preview');
const btnRetImgClear = document.getElementById('btn-ret-img-clear');
let retTempFile = null; // 반품 사진 임시 저장

if (btnOpenRetModal) {
    const newBtn = btnOpenRetModal.cloneNode(true);
    btnOpenRetModal.parentNode.replaceChild(newBtn, btnOpenRetModal);

    newBtn.addEventListener('click', async () => {
        // 거래처 목록 로드
        const select = document.getElementById('ret-supplier');
        try {
            const snap = await getDocs(collection(db, "suppliers"));
            let suppliers = [];
            snap.forEach(doc => suppliers.push(doc.data().name));
            suppliers.sort((a, b) => a.localeCompare(b));
            let html = '<option value="">거래처 선택</option>';
            suppliers.forEach(name => html += `<option value="${name}">${name}</option>`);
            select.innerHTML = html;
        } catch (e) {}

        // 입력창 & 사진 초기화
        document.getElementById('ret-name').value = '';
        document.getElementById('ret-maker').value = '';
        document.getElementById('ret-qty').value = '1';
        retTempFile = null;
        retImgInput.value = "";
        retImgPreview.style.display = 'none';
        btnRetImgClear.style.display = 'none';
        document.getElementById('ret-img-label').textContent = "📸 증빙 사진 첨부 (선택)";

        retModal.style.display = 'flex';
    });
}

// 사진 선택 시 미리보기
if (retImgInput) {
    retImgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            retTempFile = file;
            const reader = new FileReader();
            reader.onload = (ev) => {
                retImgPreview.src = ev.target.result;
                retImgPreview.style.display = 'block';
                btnRetImgClear.style.display = 'block';
                document.getElementById('ret-img-label').textContent = "사진 변경";
            };
            reader.readAsDataURL(file);
        }
    });
}
// 사진 삭제 버튼
if (btnRetImgClear) {
    btnRetImgClear.addEventListener('click', () => {
        retTempFile = null;
        retImgInput.value = "";
        retImgPreview.style.display = 'none';
        btnRetImgClear.style.display = 'none';
        document.getElementById('ret-img-label').textContent = "📸 증빙 사진 첨부 (선택)";
    });
}

// 퀵등록 버튼 연결
const btnRetQuickSup = document.getElementById('btn-ret-quick-sup');
if (btnRetQuickSup) {
    btnRetQuickSup.addEventListener('click', () => {
        document.getElementById('btn-quick-sup-open').click();
    });
}
if (btnRetCancel) btnRetCancel.addEventListener('click', () => retModal.style.display = 'none');

// [수정] 저장 버튼 (사진 업로드 포함)
if (btnRetSave) {
    const newSaveBtn = btnRetSave.cloneNode(true);
    btnRetSave.parentNode.replaceChild(newSaveBtn, btnRetSave);

    newSaveBtn.addEventListener('click', async () => {
        const name = document.getElementById('ret-name').value;
        const maker = document.getElementById('ret-maker').value;
        const supplier = document.getElementById('ret-supplier').value;
        const qty = document.getElementById('ret-qty').value;
        const pkgType = document.getElementById('ret-pkg-type').value;
        const reason = document.getElementById('ret-reason').value;

        if (!name || !supplier) {
            alert("약품명과 반품처는 필수입니다.");
            return;
        }

        const loadingSpinner = document.getElementById('loading-spinner');
        try {
            if (loadingSpinner) loadingSpinner.style.display = 'flex';

            let downloadURL = null;
            // 사진이 있으면 먼저 업로드
            if (retTempFile) {
                const options = { maxSizeMB: 0.3, maxWidthOrHeight: 1024, useWebWorker: true };
                const compressedFile = await imageCompression(retTempFile, options);
                const storageRef = ref(storage, `returns/${Date.now()}_${retTempFile.name}`);
                await uploadBytes(storageRef, compressedFile);
                downloadURL = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, "returns"), {
                productName: name,
                manufacturer: maker,
                supplier: supplier,
                qty: Number(qty),
                pkgType: pkgType,
                reason: reason,
                imageUrl: downloadURL, // 사진 URL 저장
                status: 'requested',
                dates: { requested: new Date() }
            });

            if (loadingSpinner) loadingSpinner.style.display = 'none';
            alert("반품이 등록되었습니다.");
            retModal.style.display = 'none';
        } catch (e) {
            console.error(e);
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            alert("등록 실패");
        }
    });
}
// 5. 반품 목록 실시간 구독 & 렌더링
/* ==========================================================================
   [수정] 반품 목록 구독 (상태별 날짜 표시 기능 추가)
   ========================================================================== */
function subscribeToReturns() {
    const listContainer = document.getElementById('return-list-container');
    if(!listContainer) return;

    // 최신순 정렬
    const q = query(collection(db, "returns"), orderBy("dates.requested", "desc"), limit(50));

    onSnapshot(q, (snapshot) => {
        listContainer.innerHTML = "";
        const countEl = document.getElementById('return-total-count');
        if (countEl) countEl.textContent = snapshot.size;

        if (snapshot.empty) {
            listContainer.innerHTML = "<div style='grid-column:1/-1; text-align:center; color:#ccc; padding:50px;'>반품 내역이 없습니다.</div>";
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const div = document.createElement('div');
            
            // 상태별 스타일
            div.className = `return-card status-${data.status}`;

            // 1. 날짜 포맷팅 (YYYY.MM.DD)
            const formatDate = (ts) => ts ? new Date(ts.toDate()).toLocaleDateString() : '-';
            const dReq = data.dates?.requested ? formatDate(data.dates.requested) : '-';
            const dCol = data.dates?.collected ? formatDate(data.dates.collected) : '-';
            const dCom = data.dates?.completed ? formatDate(data.dates.completed) : '-';

            // 2. 상태별 텍스트 & 날짜 표시 로직 (핵심 수정)
            let statusText = "🔴 반품요청";
            let dateDisplay = `신청일: ${dReq}`; // 기본: 신청일만 표시
            
            let btnHtml = `<button class="ret-status-btn" style="background:#f1c40f;">수거완료 처리</button>`;
            let undoHtml = "";

            if (data.status === 'collected') {
                statusText = "🟡 수거완료";
                // 수거완료 시: 신청일 + 수거일 표시
                dateDisplay = `<span style="color:#999;">신청: ${dReq}</span><br><strong>🚚 수거: ${dCol}</strong>`;
                
                btnHtml = `<button class="ret-status-btn" style="background:#27ae60;">정산완료 처리</button>`;
                undoHtml = `<button class="btn-ret-undo" data-action="undo-collected">↩ 수거 취소 (요청상태로)</button>`;
            } 
            else if (data.status === 'completed') {
                statusText = "🟢 정산완료";
                // 정산완료 시: 수거일 + 정산일 표시 (신청일은 공간상 생략 or 흐리게)
                dateDisplay = `<span style="color:#999;">수거: ${dCol}</span><br><strong style="color:#27ae60;">💰 정산: ${dCom}</strong>`;
                
                btnHtml = `<button class="ret-status-btn" style="background:#95a5a6; cursor:default;" disabled>처리완료됨</button>`;
                undoHtml = `<button class="btn-ret-undo" data-action="undo-completed">↩ 정산 취소 (수거상태로)</button>`;
            }

            // [New] 사진 아이콘 (있으면 표시)
            const imgIcon = data.imageUrl ? `<a href="${data.imageUrl}" target="_blank" style="text-decoration:none; margin-left:5px;">📷</a>` : '';

            div.innerHTML = `
                <div class="ret-header">
                    <div>
                        <div class="ret-name">${data.productName} ${imgIcon}</div>
                        <div class="ret-maker">${data.manufacturer || '-'}</div>
                    </div>
                    <div style="font-weight:bold; color:#e74c3c;">${data.supplier}</div>
                </div>
                <div>
                    <span class="ret-badge">${data.pkgType === 'box' ? '📦 완통' : '💊 낱알'}</span>
                    <span class="ret-badge">${data.qty}개</span>
                    <span class="ret-badge" style="background:#fff3cd;">${data.reason}</span>
                </div>
                <div style="margin-top:10px; font-size:0.85rem; color:#555; line-height:1.4;">
                    ${dateDisplay} <br> 
                    <div style="margin-top:5px; border-top:1px dashed #eee; padding-top:5px;">상태: ${statusText}</div>
                </div>
                
                ${btnHtml}
                ${undoHtml}
                
                <div style="text-align:right; margin-top:5px;">
                    <button class="btn-delete-return" style="background:none; border:none; color:#ccc; cursor:pointer; font-size:0.8rem;">삭제</button>
                </div>
            `;

            // 이벤트 연결 (상태변경, 복구, 삭제)
            const nextBtn = div.querySelector('.ret-status-btn');
            if (!nextBtn.disabled) {
                nextBtn.addEventListener('click', async () => {
                    let nextStatus = '';
                    if (data.status === 'requested') nextStatus = 'collected';
                    else if (data.status === 'collected') nextStatus = 'completed';

                    if (nextStatus && confirm("다음 단계로 처리하시겠습니까?")) {
                        const updateData = { status: nextStatus };
                        updateData[`dates.${nextStatus}`] = new Date(); // 현재 시간 기록
                        await updateDoc(doc(db, "returns", docSnap.id), updateData);
                    }
                });
            }

            const undoBtn = div.querySelector('.btn-ret-undo');
            if (undoBtn) {
                undoBtn.addEventListener('click', async (e) => {
                    const action = e.target.getAttribute('data-action');
                    let prevStatus = '';
                    
                    if (action === 'undo-collected') prevStatus = 'requested';
                    else if (action === 'undo-completed') prevStatus = 'collected';

                    if (confirm("이전 상태로 되돌리시겠습니까?")) {
                        await updateDoc(doc(db, "returns", docSnap.id), { status: prevStatus });
                    }
                });
            }

            div.querySelector('.btn-delete-return').addEventListener('click', async () => {
                if (confirm("정말 삭제하시겠습니까?")) {
                    await deleteDoc(doc(db, "returns", docSnap.id));
                }
            });

            listContainer.appendChild(div);
        });
    });
}

// 데이터 가져오기 (필터 적용)
function fetchReturns(isSearch = false) {
    const listContainer = document.getElementById('return-list-container');
    if (!listContainer) return;
    
    // 기존 리스너 해제 (중복 실행 방지)
    if (returnUnsubscribe) returnUnsubscribe();

    let q = query(collection(db, "returns"), orderBy("dates.requested", "desc"));

    // 검색 조건 적용
    if (isSearch) {
        const startVal = document.getElementById('ret-search-start').value;
        const endVal = document.getElementById('ret-search-end').value;
        
        if (startVal) {
            const startDate = new Date(startVal);
            q = query(q, where("dates.requested", ">=", startDate));
        }
        if (endVal) {
            const endDate = new Date(endVal);
            endDate.setHours(23, 59, 59); // 그 날의 끝까지
            q = query(q, where("dates.requested", "<=", endDate));
        }
    } else {
        // 기본: 최근 50개
        q = query(q, limit(50));
    }

    listContainer.innerHTML = "<div style='grid-column:1/-1; text-align:center; padding:20px;'>로딩중...</div>";

    returnUnsubscribe = onSnapshot(q, (snapshot) => {
        listContainer.innerHTML = "";
        const countEl = document.getElementById('return-total-count');
        
        // 클라이언트 사이드 키워드 필터링 (Firestore는 like 검색 미지원)
        let docs = [];
        const keyword = isSearch ? document.getElementById('ret-search-keyword').value.toLowerCase() : "";

        snapshot.forEach(doc => {
            const data = doc.data();
            if (keyword) {
                if (data.productName.toLowerCase().includes(keyword) || 
                    data.supplier.toLowerCase().includes(keyword)) {
                    docs.push({ id: doc.id, ...data });
                }
            } else {
                docs.push({ id: doc.id, ...data });
            }
        });

        if (countEl) countEl.textContent = docs.length;

        if (docs.length === 0) {
            listContainer.innerHTML = "<div style='grid-column:1/-1; text-align:center; color:#ccc; padding:50px;'>내역이 없습니다.</div>";
            return;
        }

        docs.forEach(data => {
            const div = document.createElement('div');
            div.className = `return-card status-${data.status}`;

            // 상태별 UI
            let statusText = "🔴 반품요청";
            let btnHtml = `<button class="ret-status-btn" style="background:#f1c40f;">수거완료 처리</button>`;
            let undoHtml = "";

            if (data.status === 'collected') {
                statusText = "🟡 수거완료";
                btnHtml = `<button class="ret-status-btn" style="background:#27ae60;">정산완료 처리</button>`;
                undoHtml = `<button class="btn-ret-undo" data-action="undo-collected">↩ 수거 취소 (다시 요청상태로)</button>`;
            } else if (data.status === 'completed') {
                statusText = "🟢 정산완료";
                btnHtml = `<button class="ret-status-btn" style="background:#95a5a6; cursor:default;" disabled>처리완료됨</button>`;
                undoHtml = `<button class="btn-ret-undo" data-action="undo-completed">↩ 정산 취소 (수거상태로)</button>`;
            }

            const dateReq = data.dates.requested ? data.dates.requested.toDate().toLocaleDateString() : '-';
            
            // [New] 사진 아이콘 표시
            const imgIcon = data.imageUrl ? `<a href="${data.imageUrl}" target="_blank" style="text-decoration:none;">📷</a>` : '';

            div.innerHTML = `
                <div class="ret-header">
                    <div>
                        <div class="ret-name">${data.productName} ${imgIcon}</div>
                        <div class="ret-maker">${data.manufacturer || '-'}</div>
                    </div>
                    <div style="font-weight:bold; color:#e74c3c;">${data.supplier}</div>
                </div>
                <div>
                    <span class="ret-badge">${data.pkgType === 'box' ? '📦 완통' : '💊 낱알'}</span>
                    <span class="ret-badge">${data.qty}개</span>
                    <span class="ret-badge" style="background:#fff3cd;">${data.reason}</span>
                </div>
                <div style="margin-top:10px; font-size:0.85rem; color:#888;">
                    신청일: ${dateReq} <br> 상태: <strong>${statusText}</strong>
                </div>
                ${btnHtml}
                ${undoHtml}
                <div style="text-align:right; margin-top:5px;">
                    <button class="btn-delete-return" style="background:none; border:none; color:#ccc; cursor:pointer; font-size:0.8rem;">삭제</button>
                </div>
            `;

            // 이벤트 연결 (상태변경, 복구, 삭제)
            // (기존과 동일하므로 핵심 로직만 유지)
            const nextBtn = div.querySelector('.ret-status-btn');
            if (!nextBtn.disabled) {
                nextBtn.onclick = async () => {
                    let next = data.status === 'requested' ? 'collected' : 'completed';
                    if (confirm("다음 단계로 처리하시겠습니까?")) {
                        const up = { status: next }; up[`dates.${next}`] = new Date();
                        await updateDoc(doc(db, "returns", data.id), up);
                    }
                };
            }
            const undoBtn = div.querySelector('.btn-ret-undo');
            if (undoBtn) {
                undoBtn.onclick = async () => {
                    const prev = data.status === 'collected' ? 'requested' : 'collected';
                    if (confirm("되돌리시겠습니까?")) await updateDoc(doc(db, "returns", data.id), { status: prev });
                };
            }
            div.querySelector('.btn-delete-return').onclick = async () => {
                if (confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "returns", data.id));
            };

            listContainer.appendChild(div);
        });
    });
}

// [12] 초기 실행
loadProducts();
subscribeToRecentLogs();
subscribeToPhotoRequests();
subscribeToReturns(); // <--- ★ 이거 추가!