/* ==========================================================================
   [1] Firebase 설정 및 라이브러리 임포트
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, deleteDoc, updateDoc, doc, query, where, orderBy, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ★ 중요: 본인의 Firebase 키값으로 꼭 변경해주세요!
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
   [2] 전역 변수 선언 (빠짐없이 확인)
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
let allSuppliersData = []; // [Fix] 누락된 변수 추가

let currentPhotoReqId = null; 
let tempUploadFile = null;


/* ==========================================================================
   [3] 공통 유틸리티 & 초기화
   ========================================================================== */
// 모달 닫기
document.querySelectorAll('[id^="btn-close"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modal = e.target.closest('[id$="-modal"]');
        if(modal) modal.style.display = 'none';
    });
});

// 사진 뷰어 닫기
const viewerModal = document.getElementById('photo-viewer-modal');
if(viewerModal) {
    viewerModal.addEventListener('click', (e) => { 
        if(e.target === viewerModal) viewerModal.style.display = 'none'; 
    });
    const closeBtn = viewerModal.querySelector('#viewer-close');
    if(closeBtn) closeBtn.addEventListener('click', () => viewerModal.style.display = 'none');
}

// 시간 포맷
function formatShortTime(timestamp) {
    if(!timestamp) return "";
    const d = timestamp.toDate();
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// [Fix] HTML onclick에서 호출하는 함수는 window에 등록해야 함
window.handleSmsClick = function(phoneNumber) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        window.location.href = `sms:${phoneNumber}`;
    } else {
        navigator.clipboard.writeText(phoneNumber).then(() => {
            alert(`번호(${phoneNumber})가 복사되었습니다.\nPC 메신저 등에 붙여넣기 하세요.`);
        }).catch(() => alert("복사 실패"));
    }
};


/* ==========================================================================
   [4] 데이터 불러오기 (상품) & 트리
   ========================================================================== */
async function loadProducts() {
    const listContainer = document.getElementById('product-list');
    if(listContainer) listContainer.innerHTML = "<div style='padding:20px; text-align:center'>로딩중...</div>";
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        let products = [];
        querySnapshot.forEach(doc => {
            products.push({ id: doc.id, ...doc.data() });
        });
        allProductsData = products; 
        renderMainTree(products); 
        renderAdminList(products); 
    } catch (error) { console.error("Error:", error); }
}

function renderMainTree(productsToRender) {
    const listContainer = document.getElementById('product-list');
    if(!listContainer) return;

    const tree = {};
    productsToRender.forEach(p => {
        const cat = p.category || "기타";
        const comp = p.company || "미지정";
        if (!tree[cat]) tree[cat] = {};
        if (!tree[cat][comp]) tree[cat][comp] = [];
        tree[cat][comp].push(p);
    });

    listContainer.innerHTML = ""; 
    const isSearchMode = (productsToRender.length < allProductsData.length) && (productsToRender.length > 0);
    const fixedOrder = ["전문의약품", "일반의약품", "의약외품"];
    const allCategories = Object.keys(tree);
    const sortedCategories = [ ...fixedOrder.filter(key => allCategories.includes(key)), ...allCategories.filter(key => !fixedOrder.includes(key)).sort() ];

    if(productsToRender.length === 0) {
        listContainer.innerHTML = "<div style='padding:20px; text-align:center; color:#ccc;'>검색 결과가 없습니다.</div>";
        return;
    }

    sortedCategories.forEach(categoryName => {
        const catDiv = document.createElement("div");
        catDiv.className = "tree-node tree-depth-0 tree-toggle"; 
        catDiv.textContent = categoryName;
        
        const catChildContainer = document.createElement("div");
        catChildContainer.style.display = isSearchMode ? "block" : "none"; 
        if(isSearchMode) catDiv.classList.add('open');

        catDiv.addEventListener("click", () => {
            catDiv.classList.toggle("open");
            catChildContainer.style.display = catChildContainer.style.display === "none" ? "block" : "none";
        });
        listContainer.appendChild(catDiv);
        listContainer.appendChild(catChildContainer);

        const companies = tree[categoryName];
        Object.keys(companies).sort().forEach(companyName => {
            const compDiv = document.createElement("div");
            compDiv.className = "tree-node tree-depth-1 tree-toggle";
            compDiv.textContent = companyName;
            
            const compChildContainer = document.createElement("div");
            compChildContainer.style.display = isSearchMode ? "block" : "none";
            if(isSearchMode) compDiv.classList.add('open');

            compDiv.addEventListener("click", (e) => {
                e.stopPropagation(); 
                compDiv.classList.toggle("open");
                compChildContainer.style.display = compChildContainer.style.display === "none" ? "block" : "none";
            });
            catChildContainer.appendChild(compDiv);
            catChildContainer.appendChild(compChildContainer);

            const itemList = companies[companyName];
            itemList.sort((a, b) => a.name.localeCompare(b.name));

            itemList.forEach(item => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "tree-node tree-depth-2";
                itemDiv.setAttribute("data-id", item.id);
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
        if(keyword.length > 0) {
            const orderTab = document.querySelector('.menu-item[data-target="order-mgmt"]');
            if(orderTab) orderTab.click();
        } else {
            renderMainTree(allProductsData);
            return;
        }

        if(!allProductsData || allProductsData.length === 0) return;

        const filtered = allProductsData.filter(p => 
            (p.name && p.name.toLowerCase().includes(keyword)) || 
            (p.company && p.company.toLowerCase().includes(keyword)) ||
            (p.category && p.category.toLowerCase().includes(keyword))
        );
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
                if(parent.style.display === 'none') {
                    parent.style.display = 'block';
                    const toggleBtn = parent.previousElementSibling;
                    if(toggleBtn && toggleBtn.classList.contains('tree-toggle')) toggleBtn.classList.add('open');
                }
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
    currentProduct = item; 
    currentQty = 1; 

    document.getElementById('detail-empty').style.display = 'none';
    document.getElementById('detail-content').style.display = 'flex'; 
    document.getElementById('detail-category').textContent = item.category;
    document.getElementById('detail-name').textContent = item.name;
    document.getElementById('detail-company').textContent = item.company;

    const header = document.querySelector('.order-header');
    if(photoReqId) {
        header.style.backgroundColor = "#fff8e1"; 
        header.style.border = "1px solid #f39c12"; 
        header.style.padding = "10px";
        header.setAttribute('data-photo-req-id', photoReqId); 
        document.getElementById('detail-name').innerHTML = `${item.name} <span style="font-size:0.8rem; color:#e67e22;">(사진 매칭중)</span>`;
    } else {
        header.style.backgroundColor = "transparent"; 
        header.style.border = "none"; 
        header.removeAttribute('data-photo-req-id');
    }

    const optionContainer = document.getElementById('option-list-container');
    optionContainer.innerHTML = ""; 
    const options = item.options || []; 

    if(options.length === 0) {
        optionContainer.innerHTML = "<div style='padding:20px; color:#aaa; text-align:center;'>옵션 없음</div>";
        document.getElementById('order-total-price').textContent = "0원";
        return;
    }

    options.forEach((opt, index) => {
        const card = document.createElement('div');
        card.className = 'option-card';
        const lastOrderHtml = opt.lastOrder ? `<div style="font-size:0.8rem; color:#aaa; margin-top:4px;">최근: ${opt.lastOrder}</div>` : "";
        
        card.innerHTML = `
            <div style="flex:1;">
                <div class="option-name" style="font-size:1rem;">${opt.name}</div>
                ${lastOrderHtml}
            </div>
            <div style="text-align:right;">
                <div class="option-price" style="font-weight:bold;">${Number(opt.price).toLocaleString()}원</div>
            </div>
        `;

        let isSelected = false;
        if(targetOptionId) { if(opt.id === targetOptionId) isSelected = true; } else { if(index === 0) isSelected = true; }

        if(isSelected) { card.classList.add('selected'); currentOptionPrice = Number(opt.price); currentOptionId = opt.id; }

        card.addEventListener('click', () => {
            document.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            currentQty = 1; 
            document.getElementById('order-qty').value = 1;
            currentOptionPrice = Number(opt.price); 
            currentOptionId = opt.id; 
            updateTotalPrice();
        });
        optionContainer.appendChild(card);
    });
    
    if(options.length > 0 && !targetOptionId) {
        currentOptionPrice = Number(options[0].price);
        currentOptionId = options[0].id;
    }
    
    document.getElementById('order-qty').value = 1;
    updateTotalPrice();
}

function updateTotalPrice() {
    const total = currentOptionPrice * currentQty;
    document.getElementById('order-total-price').textContent = total.toLocaleString() + "원";
}
document.getElementById('qty-plus').addEventListener('click', () => { currentQty++; document.getElementById('order-qty').value = currentQty; updateTotalPrice(); });
document.getElementById('qty-minus').addEventListener('click', () => { if(currentQty > 1) currentQty--; document.getElementById('order-qty').value = currentQty; updateTotalPrice(); });
document.getElementById('order-qty').addEventListener('input', function() {
    let val = parseInt(this.value);
    if(isNaN(val) || val < 1) val = 1; 
    currentQty = val; 
    updateTotalPrice();
});

const btnAddCart = document.getElementById('btn-add-cart');
if(btnAddCart) btnAddCart.addEventListener('click', async () => {
    if(!currentProduct || !currentOptionId) return;
    
    const selectedOptionEl = document.querySelector('.option-card.selected');
    const optionName = selectedOptionEl ? selectedOptionEl.querySelector('.option-name').textContent : "기본옵션";
    
    const header = document.querySelector('.order-header');
    const photoReqId = header.getAttribute('data-photo-req-id'); 
    
    const newItem = { 
        cartId: Date.now(), 
        optionId: currentOptionId, 
        product: currentProduct, 
        optionName: optionName, 
        qty: currentQty, 
        unitPrice: currentOptionPrice, 
        totalPrice: currentOptionPrice * currentQty,
        photoReqId: photoReqId
    };

    const existingIndex = cartItems.findIndex(i => i.optionId === currentOptionId && i.photoReqId === photoReqId);
    
    if(existingIndex !== -1) {
        cartItems[existingIndex].qty += currentQty;
        cartItems[existingIndex].totalPrice = cartItems[existingIndex].unitPrice * cartItems[existingIndex].qty;
    } else {
        cartItems.push(newItem);
    }
    
    renderCart(currentOptionId);

    if(photoReqId) {
        try {
            await updateDoc(doc(db, "photo_requests", photoReqId), { status: "processed", matchedProduct: currentProduct.name, completedAt: new Date() });
            currentPhotoReqId = null;
            header.style.backgroundColor = "transparent"; header.style.border = "none"; header.removeAttribute('data-photo-req-id');
            document.getElementById('detail-name').textContent = currentProduct.name;
            alert("사진 요청이 처리되어 장바구니에 담겼습니다.");
        } catch(e) { console.error("사진 업데이트 실패:", e); }
    }
});

// [Fix] 장바구니 리셋 함수
function resetOrderDetail() {
    document.getElementById('detail-empty').style.display = 'block';
    document.getElementById('detail-content').style.display = 'none';
    currentProduct = null; currentQty = 1; currentOptionPrice = 0; currentOptionId = null;
    
    // 사진 매칭 헤더 초기화
    const header = document.querySelector('.order-header');
    if(header) {
        header.style.backgroundColor = "transparent"; 
        header.style.border = "none"; 
        header.removeAttribute('data-photo-req-id');
    }
}

function renderCart(highlightId = null) {
    const cartList = document.getElementById('cart-list');
    cartList.innerHTML = ""; let totalAmount = 0;

    if(cartItems.length === 0) {
        cartList.innerHTML = "<div style='padding:40px 20px; text-align:center; color:#ccc;'>비어있음</div>";
    }

    cartItems.forEach((item, index) => {
        totalAmount += item.totalPrice;
        const div = document.createElement('div');
        div.className = 'cart-item-card';
        if(highlightId && item.optionId === highlightId) div.classList.add('highlight');
        
        div.addEventListener('dblclick', () => {
            document.querySelector('.menu-item[data-target="order-mgmt"]').click();
            focusProductInTree(item.product, item.optionId);
        });

        const photoIcon = item.photoReqId ? '<span style="font-size:0.8rem;">📷</span>' : '';

        div.innerHTML = `
            <div class="cart-item-left">
                <div class="cart-item-title">${item.product.name} ${photoIcon} <span style="font-size:0.85rem; color:#888;">(${item.product.company})</span></div>
                <div class="cart-item-desc">${item.optionName}</div>
            </div>
            <div class="cart-item-right">
                <div class="cart-item-price">${item.totalPrice.toLocaleString()}원</div>
                <div class="cart-item-qty">${item.qty}개</div>
            </div>
            <button class="cart-delete-btn" onclick="deleteCartItem(${index})" title="삭제">&times;</button>
        `;
        cartList.appendChild(div);
    });
    document.getElementById('cart-total-price').textContent = totalAmount.toLocaleString() + "원";
    document.getElementById('cart-count').textContent = cartItems.length;
}

// [Fix] HTML onclick용 글로벌 함수 등록
window.deleteCartItem = function(index) {
    const card = document.querySelectorAll('.cart-item-card')[index];
    deletedItemBackup = { item: cartItems[index], optionId: cartItems[index].optionId };
    if(card) card.classList.add('deleting');
    setTimeout(() => { cartItems.splice(index, 1); renderCart(); showUndoNotification(); }, 200);
};

function showUndoNotification() {
    const undoArea = document.getElementById('undo-area');
    undoArea.style.display = 'block';
    if(undoTimeout) clearTimeout(undoTimeout);
    undoTimeout = setTimeout(() => { undoArea.style.display = 'none'; deletedItemBackup = null; }, 5000);
}
if(document.getElementById('btn-undo')) document.getElementById('btn-undo').addEventListener('click', () => { if(deletedItemBackup) { cartItems.push(deletedItemBackup.item); renderCart(deletedItemBackup.optionId); document.getElementById('undo-area').style.display = 'none'; } });

if(document.getElementById('btn-order-complete')) {
    document.getElementById('btn-order-complete').addEventListener('click', async () => {
        if(cartItems.length === 0) return;
        if(!confirm(`총 ${cartItems.length}건 주문완료?`)) return;
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        try {
            await addDoc(collection(db, "order_history"), { date: dateStr, timestamp: now, items: cartItems });
            cartItems = []; 
            renderCart();
            resetOrderDetail(); // [Fix] 주문 완료 후 리셋
        } catch(e) { console.error(e); alert("주문 저장 실패"); }
    });
}


/* ==========================================================================
   [7] 하단 로그 패널
   ========================================================================== */
function subscribeToRecentLogs() {
    const logContainer = document.getElementById('completed-order-list');
    const q = query(collection(db, "order_history"), orderBy("timestamp", "desc"), limit(50));

    onSnapshot(q, (snapshot) => {
        logContainer.innerHTML = "";
        if(snapshot.empty) { logContainer.innerHTML = '<div style="color:#aaa; padding:10px;">최근 기록이 없습니다.</div>'; return; }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const dateObj = data.timestamp.toDate();
            const timeStr = `${dateObj.getMonth()+1}/${dateObj.getDate()} ${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
            
            data.items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'log-item';
                div.innerHTML = `
                    <div style="display:flex; align-items:center;"><span class="log-time">[${timeStr}]</span><strong>${item.product.name}</strong><span style="color:#888; font-size:0.85rem; margin-left:4px;">(${item.product.company})</span><span style="color:#666; margin-left:5px;">(${item.qty})</span></div>
                    <div><span class="log-status">완료</span><button class="btn-log-restore">취소</button></div>
                `;
                div.querySelector('.btn-log-restore').addEventListener('click', async () => {
                    if(confirm("취소하시겠습니까?")) {
                        cartItems.push(item); renderCart(item.optionId);
                        await deleteDoc(doc(db, "order_history", docSnap.id)); 
                    }
                });
                logContainer.appendChild(div);
            });
        });
    });
}


/* ==========================================================================
   [8] 사진 업로드 & 대기열
   ========================================================================== */
const btnCamera = document.getElementById('btn-camera-floating');
const cameraInput = document.getElementById('file-input-camera'); // ID 수정됨
const inputGallery = document.getElementById('file-input-gallery'); // ID 수정됨
const loadingSpinner = document.getElementById('loading-spinner');
const sourceModal = document.getElementById('source-select-modal');

function openSourceModal() { if(sourceModal) sourceModal.style.display = 'flex'; }
if(btnCamera) btnCamera.addEventListener('click', openSourceModal);

if(document.getElementById('btn-select-camera')) {
    document.getElementById('btn-select-camera').onclick = () => {
        sourceModal.style.display = 'none';
        if(cameraInput) cameraInput.click();
    };
}
if(document.getElementById('btn-select-gallery')) {
    document.getElementById('btn-select-gallery').onclick = () => {
        sourceModal.style.display = 'none';
        if(inputGallery) inputGallery.click();
    };
}
if(document.getElementById('btn-select-cancel')) {
    document.getElementById('btn-select-cancel').onclick = () => {
        sourceModal.style.display = 'none';
    };
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if(!file) return;

    const uploadModal = document.getElementById('upload-confirm-modal');
    const previewImg = document.getElementById('upload-preview-img');
    const uploadNote = document.getElementById('upload-note');
    
    window.tempUploadFile = file; 
    
    const reader = new FileReader();
    reader.onload = (event) => { if(previewImg) previewImg.src = event.target.result; };
    reader.readAsDataURL(file);
    
    if(uploadNote) uploadNote.value = "";
    if(uploadModal) uploadModal.style.display = 'flex';
    
    e.target.value = '';
}

if(cameraInput) cameraInput.addEventListener('change', handleFileUpload);
if(inputGallery) inputGallery.addEventListener('change', handleFileUpload);

if(document.getElementById('btn-upload-cancel')) {
    document.getElementById('btn-upload-cancel').addEventListener('click', () => {
        document.getElementById('upload-confirm-modal').style.display = 'none';
        window.tempUploadFile = null;
    });
}

if(document.getElementById('btn-upload-confirm')) {
    const btn = document.getElementById('btn-upload-confirm');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        const file = window.tempUploadFile;
        if(!file) return;
        
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
        } catch(error) {
            console.error(error);
            if(loadingSpinner) loadingSpinner.style.display = 'none';
            alert("오류 발생");
        }
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
            let statusClass = 'pending';
            if(data.status === 'hold') statusClass = 'hold';
            if(data.status === 'processed') statusClass = 'done';
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

function showPhotoViewer(docId, imageUrl, currentStatus, note) {
    let viewer = document.getElementById('photo-viewer-modal');
    if(!viewer) {
        viewer = document.createElement('div'); viewer.id = 'photo-viewer-modal';
        viewer.style.cssText = "display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:99999; align-items:center; justify-content:center; flex-direction:column;";
        document.body.appendChild(viewer);
    }

    viewer.innerHTML = `
        <div style="position:relative; max-width:90%; max-height:70%;">
            <img id="viewer-img" src="${imageUrl}" style="max-width:100%; max-height:70vh; border-radius:8px;">
            <button id="viewer-close" style="position:absolute; top:-40px; right:0; background:none; border:none; color:white; font-size:2.5rem; cursor:pointer;">&times;</button>
        </div>
        <div id="viewer-note" style="background:rgba(255,255,255,0.9); padding:10px 20px; border-radius:20px; margin-top:15px; font-weight:bold; color:#333; max-width:90%; text-align:center; display:${note ? 'block' : 'none'}">📝 메모: ${note || ''}</div>
        <div id="viewer-buttons" style="margin-top:15px; display:flex; gap:10px;"></div>
    `;

    const btnContainer = viewer.querySelector('#viewer-buttons');

    const createBtn = (text, color, action) => {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `padding:12px 20px; font-size:1.1rem; border-radius:30px; border:none; cursor:pointer; font-weight:bold; color:white; background-color:${color}; box-shadow:0 4px 10px rgba(0,0,0,0.3);`;
        btn.onclick = action;
        return btn;
    };

    const updateStatus = async (newStatus, requireReason = false) => {
        let noteUpdate = {};
        if(requireReason) {
            const reason = prompt("보류 사유를 입력하세요");
            if(reason === null) return;
            noteUpdate.note = reason; 
        }
        const updateData = { status: newStatus, ...noteUpdate };
        if(newStatus === 'processed') updateData.completedAt = new Date();
        else if(newStatus === 'pending') updateData.completedAt = null;

        try { await updateDoc(doc(db, "photo_requests", docId), updateData); viewer.style.display = 'none'; } 
        catch(e) { alert("처리 실패"); }
    };

    if(currentStatus === 'pending') {
        btnContainer.appendChild(createBtn('주문완료', '#27ae60', () => updateStatus('processed')));
        btnContainer.appendChild(createBtn('주문보류', '#f39c12', () => updateStatus('hold', true)));
    } 
    else if(currentStatus === 'hold') {
        btnContainer.appendChild(createBtn('주문완료', '#27ae60', () => updateStatus('processed')));
        btnContainer.appendChild(createBtn('대기로 복구', '#34495e', () => updateStatus('pending')));
    }
    else {
        btnContainer.appendChild(createBtn('주문취소 (복구)', '#e74c3c', () => updateStatus('pending')));
    }

    viewer.querySelector('#viewer-close').onclick = () => viewer.style.display = 'none';
    viewer.onclick = (e) => { if(e.target === viewer) viewer.style.display = 'none'; };
    
    viewer.style.display = 'flex';
}


/* ==========================================================================
   [9] 관리자(Admin) & 거래처 관리
   ========================================================================== */
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
async function startEditMode(item) {
    editingProductId = item.id; 
    await loadSupplierDropdown();
    document.getElementById('reg-category').value = item.category;
    document.getElementById('reg-company').value = item.company;
    document.getElementById('reg-name').value = item.name;
    const container = document.getElementById('reg-options-container');
    container.innerHTML = ""; 
    if(item.options && item.options.length > 0) item.options.forEach(opt => addOptionRow(opt.name, opt.price)); else addOptionRow(); 
    const btnReg = document.getElementById('btn-register');
    btnReg.textContent = "상품 수정완료"; btnReg.style.backgroundColor = "#f39c12"; 
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
const btnRegister = document.getElementById('btn-register');
if(btnRegister) {
    btnRegister.addEventListener('click', async () => {
        const cat = document.getElementById('reg-category').value;
        const comp = document.getElementById('reg-company').value;
        const name = document.getElementById('reg-name').value;
        if(!cat || !comp || !name) { alert("정보 입력 필요"); return; }
        const optionRows = document.querySelectorAll('.option-input-row');
        const options = [];
        optionRows.forEach(row => {
            const optName = row.querySelector('.opt-name').value;
            const rawPrice = row.querySelector('.opt-price').value.replace(/,/g, '');
            const optPrice = Number(rawPrice);
            if(optName && optPrice) options.push({ id: Date.now() + Math.random().toString(36).substr(2, 5), name: optName, price: optPrice, count: 1 });
        });
        if(options.length === 0) { alert("옵션 입력 필요"); return; }
        const productData = { category: cat, company: comp, name: name, stock: true, options: options, code: Date.now().toString() };
        try {
            if(editingProductId) { await updateDoc(doc(db, "products", editingProductId), productData); alert("수정됨"); editingProductId = null; btnRegister.textContent = "상품 등록하기"; btnRegister.style.backgroundColor = "#27ae60"; if(btnCancelEdit) btnCancelEdit.style.display = "none"; }
            else { await addDoc(collection(db, "products"), productData); alert("등록됨"); }
            document.getElementById('reg-name').value = ""; document.getElementById('reg-options-container').innerHTML = ""; addOptionRow(); loadProducts(); 
        } catch(e) { console.error(e); }
    });
}
async function loadSupplierDropdown() {
    const select = document.getElementById('reg-company');
    if(!select) return;
    try {
        const supSnapshot = await getDocs(collection(db, "suppliers"));
        let suppliers = [];
        supSnapshot.forEach(doc => suppliers.push(doc.data()));
        suppliers.sort((a, b) => a.name.localeCompare(b.name));
        let optionsHtml = '<option value="">거래처를 선택하세요</option>';
        suppliers.forEach(data => { optionsHtml += `<option value="${data.name}">${data.name}</option>`; });
        select.innerHTML = optionsHtml;
    } catch(e) { console.error(e); }
}
window.addOptionRow = function(name="", price="") {
    const container = document.getElementById('reg-options-container');
    const div = document.createElement('div'); div.className = 'option-input-row';
    let displayPrice = price ? Number(price).toLocaleString() : "";
    div.innerHTML = `<input type="text" class="opt-name" placeholder="옵션명" value="${name}" style="flex:2;"><input type="text" class="opt-price" placeholder="가격" value="${displayPrice}" style="flex:1;"><button class="btn-remove-row" onclick="this.parentElement.remove()">-</button>`;
    div.querySelector('.opt-price').addEventListener('input', function(e) { let val = e.target.value.replace(/[^0-9]/g, ''); e.target.value = val ? Number(val).toLocaleString() : ""; });
    container.appendChild(div);
};
if(document.getElementById('btn-add-option-row')) document.getElementById('btn-add-option-row').addEventListener('click', () => addOptionRow());

document.getElementById('btn-quick-sup-open').addEventListener('click', () => document.getElementById('quick-sup-modal').style.display = 'flex');
document.getElementById('btn-quick-sup-cancel').addEventListener('click', () => document.getElementById('quick-sup-modal').style.display = 'none');
document.getElementById('btn-quick-sup-save').addEventListener('click', async () => {
    const name = document.getElementById('quick-sup-name').value;
    if(!name) return;
    await addDoc(collection(db, "suppliers"), { name: name });
    alert("거래처 등록"); document.getElementById('quick-sup-name').value = ""; document.getElementById('quick-sup-modal').style.display = 'none'; loadSupplierDropdown();
});

// [New] 거래처 리스트 렌더링 (검색 & 문자 기능 포함)
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
        let suppliers = [];
        supSnapshot.forEach(doc => suppliers.push({ id: doc.id, ...doc.data() }));
        const prodSnapshot = await getDocs(collection(db, "products"));
        const companyProductMap = {}; 
        prodSnapshot.forEach(doc => { 
            const p = { id: doc.id, ...doc.data() }; 
            const comp = p.company || "미지정"; 
            if(!companyProductMap[comp]) companyProductMap[comp] = []; 
            companyProductMap[comp].push(p); 
        });
        
        suppliers.forEach(sup => { sup.products = companyProductMap[sup.name] || []; });
        allSuppliersData = suppliers; 
        
        document.getElementById('sup-total-count').textContent = suppliers.length;
        renderSupplierList(suppliers);

    } catch (e) { console.error(e); }
}
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
        div.addEventListener('click', () => {
            document.querySelectorAll('.supplier-card').forEach(c => c.classList.remove('active'));
            div.classList.add('active');
            fillSupplierForm(sup);
        });

        const btnSms = div.querySelector('.btn-sms-list');
        if(btnSms) btnSms.addEventListener('click', (e) => { e.stopPropagation(); handleSmsClick(sup.curManagerPhone); });

        listContainer.appendChild(div);
    });
}
window.triggerTagAction = function(productId) { document.querySelector('.menu-item[data-target="order-mgmt"]').click(); setTimeout(() => { const targetNode = document.querySelector(`.tree-node[data-id="${productId}"]`); if(targetNode) targetNode.click(); }, 100); };
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
    
    // [Fix] 문자 버튼 업데이트
    let smsBtn = document.getElementById('btn-sms-cur');
    if(!smsBtn) {
        const container = document.getElementById('sup-cur-phone').parentNode;
        smsBtn = document.createElement('a'); smsBtn.id = 'btn-sms-cur';
        smsBtn.style.cssText = "display:none; align-items:center; justify-content:center; width:40px; background:#2ecc71; border-radius:4px; text-decoration:none; font-size:1.2rem; cursor:pointer;";
        smsBtn.innerText = "✉️";
        container.appendChild(smsBtn);
    }
    if(sup.curManagerPhone) {
        smsBtn.style.display = 'flex';
        smsBtn.onclick = (e) => { e.preventDefault(); handleSmsClick(sup.curManagerPhone); };
    } else {
        smsBtn.style.display = 'none';
    }
}
// [Fix] 글로벌 문자 처리 (PC/모바일 분기)
window.handleSmsClick = function(phoneNumber) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) { window.location.href = `sms:${phoneNumber}`; } 
    else { navigator.clipboard.writeText(phoneNumber).then(() => alert(`번호(${phoneNumber}) 복사됨`)).catch(() => alert("복사 실패")); }
};


/* ==========================================================================
   [12] 달력 및 초기화
   ========================================================================== */
function renderCalendar() {
    const grid = document.getElementById('calendar-grid'); const monthEl = document.getElementById('cal-current-month');
    if(!grid) return; grid.innerHTML = "";
    const year = calDate.getFullYear(); const month = calDate.getMonth(); 
    monthEl.textContent = `${year}.${String(month + 1).padStart(2, '0')}`;
    const firstDay = new Date(year, month, 1).getDay(); const lastDate = new Date(year, month + 1, 0).getDate(); 
    const today = new Date(); const isThisMonth = (today.getFullYear() === year && today.getMonth() === month);
    for(let i=0; i<firstDay; i++) { const div = document.createElement('div'); div.className = 'calendar-date empty'; grid.appendChild(div); }
    for(let i=1; i<=lastDate; i++) {
        const div = document.createElement('div'); div.className = 'calendar-date'; div.textContent = i;
        const dateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        div.setAttribute('data-date', dateStr);
        if(isThisMonth && today.getDate() === i) div.classList.add('today');
        if(selectedDateStr === dateStr) div.classList.add('selected');
        div.addEventListener('click', () => { document.querySelectorAll('.calendar-date').forEach(d => d.classList.remove('selected')); div.classList.add('selected'); selectedDateStr = dateStr; loadHistoryByDate(dateStr); });
        grid.appendChild(div);
    }
    const startStr = `${year}-${String(month+1).padStart(2,'0')}-01`; const endStr = `${year}-${String(month+1).padStart(2,'0')}-31`;
    const q = query(collection(db, "order_history"), where("date", ">=", startStr), where("date", "<=", endStr));
    getDocs(q).then(snap => { const dates = new Set(); snap.forEach(d => dates.add(d.data().date)); document.querySelectorAll('.calendar-date').forEach(el => { if(dates.has(el.getAttribute('data-date'))) el.classList.add('has-data'); }); });
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
            items.forEach(item => { itemsHtml += `<div class="history-item-row"><span>${item.product.name} <span style="color:#888; font-size:0.85rem;">(${item.product.company})</span> <span style="color:#666;">(${item.optionName})</span></span><strong>${item.qty}개</strong></div>`; });
            card.innerHTML = `<div class="history-time">⏰ ${timeStr} (총 ${items.length}품목)</div><div style="border-top:1px solid #eee; margin-top:5px; padding-top:5px;">${itemsHtml}</div>`;
            listContainer.appendChild(card);
        });
    } catch (e) { console.error(e); }
}

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

// 초기 실행
loadProducts();
subscribeToRecentLogs();
subscribeToPhotoRequests();