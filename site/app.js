// Landing page behaviour: language switch, the live demo, a light reveal on scroll and the download buttons.
// No tracking and no third-party scripts. The only request is to GitHub's public releases API.
(() => {
  const repo = (window.LORE && window.LORE.repo) || 'tevo-web/lore';
  const gh = 'https://github.com/' + repo;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Repository links ---------------------------------------------------------------------------------------
  for (const a of $$('[data-repo]')) a.href = gh;
  for (const a of $$('[data-repo-path]')) a.href = gh + '/' + a.dataset.repoPath;
  for (const c of $$('pre code')) c.textContent = c.textContent.replace(/github\.com\/[\w.-]+\/[\w.-]+\.git/, 'github.com/' + repo + '.git').replace(/cd [\w.-]+\/desktop/, 'cd ' + repo.split('/')[1] + '/desktop');

  // ---- Words in two languages ---------------------------------------------------------------------------------
  const VI = {
    "skip": "Bỏ qua, tới nội dung",
    "nav.features": "Một ngày cùng Lore",
    "nav.privacy": "Riêng tư",
    "nav.download": "Tải về",
    "nav.faq": "Hỏi đáp",
    "nav.extras": "Thêm nữa",
    "hero.eyebrow": "Miễn phí · Mã nguồn mở · MIT",
    "hero.h1": "<span>Trình duyệt nhớ bạn,</span> <span>và chỉ mình bạn.</span>",
    "hero.lead": "Trình duyệt riêng tư có AI ngay từ đầu. Bạn hỏi trong một ô duy nhất, trò chuyện liền mạch qua nhiều tab, nhờ nó sắp xếp tab, và tìm lại bất cứ thứ gì đã đọc. Ký ức chỉ nằm trên máy của bạn.",
    "cta.download": "Tải Lore",
    "cta.github": "Xem trên GitHub",
    "cta.note": "Có cho macOS, Windows và Linux. Đây là bản đầu tiên, chưa được ký số.",
    "demo.note": "Minh họa cách Lore hoạt động.",
    "trust.1.b": "Không cần tài khoản",
    "trust.1.t": "Mở lên là dùng",
    "trust.2.b": "Không thu thập dữ liệu",
    "trust.2.t": "Không gửi gì về máy chủ",
    "trust.3.b": "AI do bạn chọn",
    "trust.3.t": "Trên máy, khóa riêng, hoặc tắt",
    "trust.4.b": "Giấy phép MIT",
    "trust.4.t": "Đọc, sửa, chia sẻ tự do",
    "st.h": "Một ngày bình thường.",
    "st.p": "Và đây là chỗ của Lore trong ngày ấy.",
    "f1.eyebrow": "7:40 sáng",
    "f1.h": "Có điều bạn thắc mắc. Cứ hỏi thẳng.",
    "f1.p": "Mỗi tab mới bắt đầu từ chỗ bạn dừng: cuộc trò chuyện AI gần nhất, các trang đã đọc, các trang bạn hay vào. Hoặc cứ hỏi thẳng: gõ câu hỏi, không cần địa chỉ. Lore trả lời ngắn gọn và cho bạn biết câu trả lời đến từ đâu. Còn giá vé hay chuyến bay thì nó không bao giờ đoán bừa.",
    "f2.eyebrow": "9:15 sáng",
    "f2.h": "Bài báo dài, buổi sáng ngắn.",
    "f2.p": "Lore ở ngay bên cạnh trang, trong một ô duy nhất: hỏi, hoặc nhờ nó làm gì đó. Nó tóm tắt giúp bạn, hoặc khi bạn hỏi \"bài này có nói đến giá không?\" thì chỉ ngay đúng dòng đó. Mỗi trang giữ cuộc trò chuyện riêng, ngay trên máy của bạn.",
    "f9.eyebrow": "9:40 sáng",
    "f9.h": "Mở thêm một trang. Cứ nói tiếp.",
    "f9.p": "Hỏi về một trang, chuyển sang tab khác rồi hỏi tiếp: Lore thêm trang mới vào cùng cuộc trò chuyện và vẫn giữ trang đầu làm nguồn. Câu trả lời cho biết từng ý lấy từ trang nào, bấm vào là tới đúng trang đó.",
    "f9.note": "Câu trả lời trong ảnh do một mô hình thử nghiệm viết.",
    "x.12.b": "Tab nằm bên cạnh",
    "x.12.t": "Danh sách bên trái với tên đọc được, nhóm là các khối có màu, và chế độ chỉ còn icon chỉ bằng một phím.",
    "p.7.b": "Liên kết theo dõi được làm sạch",
    "p.7.t": "Các mã utm_ và fbclid bị gỡ.",
    "p.8.b": "Ưu tiên kết nối bảo mật",
    "p.8.t": "Thử https trước khi dùng http thường.",
    "p.9.b": "DNS mã hóa",
    "p.9.t": "Nhà mạng không thấy tên các trang bạn vào.",
    "l.r7.a": "Bạn tạo một email ẩn danh",
    "l.r7.b": "Dịch vụ email ẩn danh bạn đã chọn",
    "l.r7.c": "Một ghi chú có tên trang web",
    "h.5": "Trình quản lý mật khẩu chưa có nhập dữ liệu hay passkey, và chưa tự điền địa chỉ",
    "q.10s": "Làm sao giữ chi phí AI đám mây thấp?",
    "q.10p": "Cài đặt > Mô hình AI > \"Lượng dữ liệu gửi cho mô hình\": chế độ Tiết kiệm chỉ gửi các câu chính của trang. Câu trả lời bạn đã hỏi rồi được hiện lại miễn phí, và mỗi câu trả lời từ mô hình đám mây cho thấy số token đã dùng.",
    "f7.eyebrow": "10:20 sáng",
    "f7.h": "Mười hai tab, một lần dọn gọn.",
    "f7.p": "Mở quá nhiều tab? Chúng nằm thành danh sách bên trái, và Lore đọc tiêu đề rồi gom theo chủ đề: một chuyến đi, một dự án, một mối quan tâm. Bạn xem trước kế hoạch, sửa tùy ý, bấm Áp dụng, và hoàn tác nếu đổi ý. Tab trùng cũng được tìm ra.",
    "f7.note": "Các nhóm trong ảnh do một mô hình thử nghiệm tạo ra.",
    "f7.win": "Sắp xếp",
    "f2.note": "Bản tóm tắt trong ảnh do một mô hình thử nghiệm viết.",
    "f3.eyebrow": "11:30 sáng",
    "f3.h": "Bức email bạn cứ hoãn mãi.",
    "f3.p": "Bạn chỉ cần nói mình muốn viết gì. Lore soạn bản nháp rồi mở sẵn trong Gmail hoặc Outlook của bạn. Bạn đọc lại, và chính bạn là người bấm Gửi.",
    "f3.note": "Bản nháp trong ảnh do một mô hình thử nghiệm viết.",
    "f8.eyebrow": "1:00 chiều",
    "f8.h": "Đọc bên này, ghi chép bên kia.",
    "f8.p": "Mở hai trang cạnh nhau và kéo thanh chia đến chỗ bạn muốn. Bấm vào bên nào, Lore theo bên đó, nên công cụ và địa chỉ luôn thuộc về trang bạn đang xem.",
    "f4.eyebrow": "2:00 chiều",
    "f4.h": "Khoan, trang đó ở đâu nhỉ?",
    "f4.p": "Bạn nhớ nội dung chứ không nhớ địa chỉ. Cứ hỏi theo ý, Lore sẽ tìm ra trong bộ nhớ đã mã hóa, chỉ nằm trên máy của bạn. Nó cũng viết được một ghi chú ngắn về những gì bạn đã đọc hôm nay.",
    "x.h": "Và những thứ bạn vẫn mong đợi.",
    "x.p": "Một trình duyệt cũng phải làm tốt những điều cơ bản.",
    "x.1.b": "Hồ sơ",
    "x.1.t": "Tách công việc và cá nhân: đăng nhập, tab, trí nhớ và dấu trang riêng.",
    "x.3.b": "Sáng, tối hoặc theo máy",
    "x.3.t": "Theo hệ thống, hoặc giữ đúng kiểu bạn chọn.",
    "x.4.b": "Mất mạng? Chơi một ván.",
    "x.4.t": "Một trò hoa sen nhỏ trong lúc chờ. Có mạng trở lại, trang tự tải lại.",
    "x.5.b": "Dấu trang, lịch sử, tải xuống",
    "x.5.t": "Thanh dấu trang, lịch sử theo ngày, danh sách tải xuống, tìm trong trang, và các tab trở lại sau khi mở lại. Tất cả mở ngay trên trang, không bật cửa sổ riêng.",
    "x.6.b": "Tự cập nhật",
    "x.6.t": "Lore báo khi có bản mới, và tự cài trên Windows và Linux.",
    "x.8.b": "So sánh tab và hỏi PDF",
    "x.8.t": "Chọn hai đến bốn trang để có một bảng; số liệu không có trên trang sẽ bị đánh dấu. PDF mở ngay trong tab và trả lời kèm số trang.",
    "x.9.b": "Quyền riêng tư trong tầm mắt",
    "x.9.t": "Bấm vào khiên: quảng cáo, liên kết theo dõi, ưu tiên https và Trí nhớ, có công tắc riêng cho từng trang. Báo cáo hằng tuần, DNS mã hóa và tab tự hủy.",
    "x.10.b": "Mật khẩu giữ ngay trên máy",
    "x.10.t": "Lưu trong chìa khóa của hệ điều hành, chỉ điền khi bạn yêu cầu và chỉ trên đúng trang. Kiểm tra lộ lọt mà không gửi mật khẩu đi.",
    "x.11.b": "Phần còn lại của một trình duyệt",
    "x.11.t": "Chọn công cụ tìm kiếm, xóa dữ liệu theo loại, in hoặc lưu PDF, zoom theo từng trang, xem mã nguồn, danh sách đọc và trang tự phục hồi khi tab bị sập.",
    "l.r6.a": "Bạn kiểm tra mật khẩu có bị lộ không",
    "l.r6.c": "5 ký tự đầu của mã băm, không bao giờ là mật khẩu",
    "x.7.b": "Một ô cho mọi việc",
    "x.7.t": "Khi bạn gõ, một nhãn nhỏ cho biết Enter sẽ làm gì: mở trang, hỏi Lore, soạn thảo hay tìm trong trí nhớ.",
    "m.eyebrow": "Phút đầu tiên",
    "m.h": "Chuyển sang chỉ mất khoảng một phút.",
    "m.1": "Đặt tên hồ sơ",
    "m.2": "Mang dấu trang và lịch sử sang",
    "m.3": "Đặt Lore làm mặc định",
    "m.note": "Nhập được dấu trang và lịch sử từ Chrome, Edge, Brave, Vivaldi, Cốc Cốc và Firefox. Mật khẩu không được nhập.",
    "p.eyebrow": "Cả ngày, âm thầm",
    "p.h": "Bạn chưa hề chỉnh cài đặt nào. Mọi thứ đã được bật sẵn.",
    "p.1.b": "Chặn quảng cáo và trình theo dõi",
    "p.1.t": "Dùng EasyList, EasyPrivacy và nhiều danh sách khác.",
    "p.2.b": "Chặn cookie bên thứ ba",
    "p.2.t": "Các trang không bám theo bạn từ nơi này sang nơi khác.",
    "p.3.b": "Cảnh báo lừa đảo",
    "p.3.t": "Báo khi gặp trang giả mạo ngân hàng hay ví điện tử.",
    "p.4.b": "Tab riêng tư",
    "p.4.t": "Không lưu lại gì, và mang sắc tím để bạn dễ nhận ra.",
    "p.5.b": "Giảm dấu vân tay",
    "p.5.t": "Thiết bị của bạn trông giống mọi người khác.",
    "p.6.b": "Chỉ hỏi quyền một lần",
    "p.6.t": "Không bao giờ tự động cấp quyền.",
    "l.h": "Dữ liệu nào rời khỏi máy bạn",
    "l.when": "Khi nào",
    "l.to": "Gửi đến",
    "l.what": "Nội dung gửi",
    "l.r1.a": "Bạn hỏi một câu kiến thức",
    "l.r1.c": "Các từ khóa chủ đề",
    "l.r2.a": "Bạn tìm kiếm trên web",
    "l.r2.c": "Câu bạn tìm",
    "l.r5.a": "Vài giờ một lần",
    "l.r5.c": "Chỉ địa chỉ IP và số phiên bản (kiểm tra bản cập nhật)",
    "l.r3.a": "Khoảng mỗi tuần một lần",
    "l.r3.c": "Không gửi gì (chỉ tải danh sách lọc)",
    "l.r4.a": "Bạn dùng khóa AI trên đám mây",
    "l.r4.b": "Nhà cung cấp bạn chọn",
    "l.r4.c": "Nội dung bạn nhờ xử lý",
    "l.note": "Lịch sử, nội dung trang và trí nhớ không bao giờ được tải lên.",
    "l.link": "Xem danh sách đầy đủ",
    "f6.eyebrow": "9:30 tối",
    "f6.h": "AI do bạn chọn. Luật do bạn đặt.",
    "f6.p": "Lore dùng được mô hình chạy ngay trên máy bạn, khóa API riêng của bạn, hoặc không cần AI. Bạn chọn, mọi thứ còn lại vẫn hoạt động bình thường. Bạn cũng chọn được lượng nội dung trang gửi đi, và xem số token mà mô hình đám mây đã dùng.",
    "f6.win": "Cài đặt",
    "c.0": "Trên máy bạn",
    "c.1": "Khóa riêng",
    "c.2": "Tắt AI",
    "c.t0": "Mô hình chạy qua Ollama ngay trên máy, nên điều bạn hỏi không bao giờ rời khỏi máy. Chỉ cần một nút để cài.",
    "c.t1": "Nhập khóa API của bạn cho OpenAI, Claude, Gemini, Mistral hoặc dịch vụ tương thích OpenAI. Lore luôn cho bạn biết văn bản đã được gửi đi đâu.",
    "c.t2": "Tắt hẳn AI. Câu trả lời từ Wikipedia, trí nhớ, chặn quảng cáo và cảnh báo lừa đảo vẫn hoạt động.",
    "h.h": "Nói thật với bạn",
    "h.p": "Lore còn non trẻ. Chúng tôi muốn nói trước, còn hơn để bạn tự phát hiện.",
    "h.1": "Chưa có bản cho điện thoại. Bản Linux còn mới.",
    "h.2": "Chưa thể thanh toán hóa đơn hay đặt vé thật",
    "h.3": "Chưa có VPN, đồng bộ giữa các thiết bị hay tiện ích mở rộng",
    "h.4": "Bộ cài chưa được ký số, nên máy tính của bạn sẽ cảnh báo",
    "d.h": "Sẵn sàng khi bạn muốn.",
    "d.sub": "Miễn phí, không cần tài khoản, không kèm điều kiện nào.",
    "d.none": "Bản phát hành đầu tiên sắp ra mắt. Trong lúc chờ, bạn có thể tự build từ mã nguồn.",
    "d.upd": "Lore tự kiểm tra bản cập nhật. Bạn có thể tắt trong Cài đặt.",
    "d.sums": "Mỗi bản phát hành đều kèm mã SHA-256 để bạn đối chiếu.",
    "d.all": "Tất cả bản phát hành",
    "w.p1b": "Vẫn không mở được, hoặc báo ứng dụng bị hỏng? Hãy chạy lệnh này trong Terminal rồi mở lại Lore:",
    "w.s1": "macOS không cho mở ứng dụng",
    "w.p1": "Do ứng dụng chưa được ký số. Hãy kéo Lore vào thư mục Applications, nhấp chuột phải vào Lore, chọn Open rồi xác nhận. Bạn chỉ cần làm một lần.",
    "w.s2": "Windows hiện cảnh báo \"Windows protected your PC\"",
    "w.p2": "Bấm More info rồi chọn Run anyway. Nếu bạn không muốn chạy một tệp cài sẵn, hãy tự build từ mã nguồn.",
    "s.h": "Tự build từ mã nguồn",
    "s.src": "Cần có Node.js 22 trở lên và Git.",
    "q.h": "Hỏi đáp",
    "q.1s": "Lore có miễn phí không?",
    "q.1p": "Có. Lore là mã nguồn mở, không cần tài khoản và không có quảng cáo. Chỉ khi bạn dùng khóa AI trên đám mây thì nhà cung cấp đó mới có thể tính phí. Mô hình chạy trên máy bạn thì miễn phí.",
    "q.2s": "Lore có thật sự riêng tư không?",
    "q.2p": "Lore không có công cụ phân tích hay thu thập dữ liệu. Lịch sử và trí nhớ nằm trên máy bạn và được mã hóa. Lore nói \"riêng tư\" chứ không nói \"ẩn danh\": các trang web bạn truy cập vẫn thấy kết nối của bạn, và dịch vụ AI trên đám mây sẽ nhận nội dung bạn gửi cho nó. Mỗi kết quả đều cho biết văn bản đã được gửi đi đâu.",
    "q.3s": "Tôi có cần mô hình AI không?",
    "q.3p": "Không. Khi không có mô hình, các tính năng trả lời, trí nhớ, chặn quảng cáo và cảnh báo lừa đảo vẫn hoạt động. Mô hình AI bổ sung khả năng viết, tóm tắt và dịch.",
    "q.8s": "Tôi mang dấu trang và lịch sử sang được không?",
    "q.8p": "Được, từ Chrome, Edge, Brave, Vivaldi, Cốc Cốc và Firefox trên máy này, hoặc từ một tệp dấu trang. Mật khẩu không được nhập.",
    "q.9s": "Lore có tự cập nhật không?",
    "q.9p": "Lore tự kiểm tra bản mới, và trên Windows và Linux sẽ cài giúp bạn. Trên macOS, cho đến khi ứng dụng được ký số, Lore chỉ báo và mở trang tải về.",
    "q.5s": "Tôi đăng nhập Google được không?",
    "q.5p": "Đôi khi được. Google chặn đăng nhập trên một số trình duyệt nhúng. Nếu bị từ chối, Lore sẽ đề nghị mở trang đó bằng trình duyệt của hệ thống.",
    "q.6s": "Có bản cho Android hay iPhone không?",
    "q.6p": "Đã có kế hoạch nhưng chưa bắt đầu.",
    "q.7s": "Ai làm ra Lore?",
    "q.7p": "Tevo cùng cộng đồng đóng góp. Lore theo giấy phép MIT và luôn hoan nghênh đóng góp.",
    "foot.tag": "Trình duyệt nhớ bạn, và chỉ mình bạn.",
    "foot.shots": "Ảnh chụp màn hình có nội dung Wikipedia (CC BY-SA).",
    "foot.issues": "Báo lỗi",
    "foot.contrib": "Đóng góp",
    "foot.license": "Giấy phép",
    "foot.security": "Bảo mật"
  };
  const EN = {};
  const nodes = $$('[data-i18n]');
  for (const el of nodes) if (!(el.dataset.i18n in EN)) EN[el.dataset.i18n] = el.innerHTML;
  EN['c.t1'] = 'Plug in your key for OpenAI, Claude, Gemini, Mistral or any OpenAI-compatible service. Lore tells you where each text went.';
  EN['c.t2'] = 'Switch AI off. Answers from Wikipedia, memory, ad blocking and scam warnings all still work.';
  // ---- Signed or not: the warnings follow the switch in config.js ---------------------------------------------
  const signed = (window.LORE && window.LORE.signed) || {};
  const sm = !!signed.mac, sw = !!signed.windows;
  if (sm) $$('[data-unsigned="mac"]').forEach((n) => n.remove());
  if (sw) $$('[data-unsigned="win"]').forEach((n) => n.remove());
  if (sm && sw) $$('[data-unsigned="any"]').forEach((n) => n.remove());
  if (!$('[data-unsigned="mac"], [data-unsigned="win"]')) $$('[data-unsigned="faq"]').forEach((n) => n.remove());
  if (sm && sw) { EN['cta.note'] = 'macOS, Windows and Linux. Early version.'; VI['cta.note'] = 'Có cho macOS, Windows và Linux. Đây là bản đầu tiên.'; }
  else if (sm) { EN['cta.note'] = 'macOS, Windows and Linux. Early version. The macOS app is signed; Windows is not yet.'; VI['cta.note'] = 'Có cho macOS, Windows và Linux. Bản macOS đã được ký số, bản Windows thì chưa.'; EN['h.4'] = 'The Windows installer is not signed yet, so expect a warning'; VI['h.4'] = 'Bộ cài Windows chưa được ký số, nên sẽ có cảnh báo'; }
  else if (sw) { EN['cta.note'] = 'macOS, Windows and Linux. Early version. The Windows installer is signed; macOS is not yet.'; VI['cta.note'] = 'Có cho macOS, Windows và Linux. Bộ cài Windows đã được ký số, bản macOS thì chưa.'; EN['h.4'] = 'The macOS app is not signed yet, so expect a warning'; VI['h.4'] = 'Bản macOS chưa được ký số, nên sẽ có cảnh báo'; }

  let lang = 'en';
  const t = (k) => (lang === 'vi' && VI[k] !== undefined ? VI[k] : EN[k]);

  // ---- The live demo -------------------------------------------------------------------------------------------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const DEMO = {
    en: [
      { q: 'What is Da Nang?', chip: 'Ask Lore', card: () => { const c = el('div', 'd-card'); c.append(el('span', 'd-tag', 'Answer'), el('p', 'd-big', 'Da Nang is the fourth largest city in Vietnam by population, on the South Central Coast.'), (() => { const s = el('div', 'd-src'); s.append(el('span', 'd-chip', 'Source: Wikipedia, Da Nang'), el('span', 'd-chip', 'Open the original page')); return s; })()); return c; } },
      { q: 'Draft an email asking for a day off', chip: 'Write with AI', card: () => { const c = el('div', 'd-card'); c.append(el('span', 'd-tag', 'Draft'), field('Subject', 'Request for a day off on Friday'), el('p', 'd-body', 'Hi [name],\n\nCould I take Friday off? I will make sure everything is covered before I go.\n\nThanks,'), actions('Open in Gmail', 'You review it. You press Send.')); return c; } },
      { q: 'Find the article I read last week about EVs', chip: 'Search memory', card: () => { const c = el('div', 'd-card'); c.append(el('span', 'd-tag', 'From your memory'), hit('E', 'Electric cars: what changed this year', 'example.com · 6 days ago'), el('p', 'd-note', 'Found on this computer. Nothing was uploaded.')); return c; } }
    ],
    vi: [
      { q: 'Đà Nẵng là gì?', chip: 'Hỏi Lore', card: () => { const c = el('div', 'd-card'); c.append(el('span', 'd-tag', 'Trả lời'), el('p', 'd-big', 'Đà Nẵng là thành phố lớn thứ tư của Việt Nam theo dân số, nằm ở Duyên hải Nam Trung Bộ.'), (() => { const s = el('div', 'd-src'); s.append(el('span', 'd-chip', 'Nguồn: Wikipedia, Đà Nẵng'), el('span', 'd-chip', 'Mở trang gốc')); return s; })()); return c; } },
      { q: 'Soạn email xin nghỉ một ngày', chip: 'Soạn bằng AI', card: () => { const c = el('div', 'd-card'); c.append(el('span', 'd-tag', 'Bản nháp'), field('Tiêu đề', 'Xin nghỉ phép ngày thứ Sáu'), el('p', 'd-body', 'Chào anh/chị [tên],\n\nEm xin phép được nghỉ vào thứ Sáu này. Em sẽ bàn giao xong công việc trước khi nghỉ.\n\nEm cảm ơn anh/chị,'), actions('Mở trong Gmail', 'Bạn xem lại rồi tự bấm Gửi.')); return c; } },
      { q: 'Tìm lại bài báo tuần trước về xe điện', chip: 'Tìm trong trí nhớ', card: () => { const c = el('div', 'd-card'); c.append(el('span', 'd-tag', 'Từ trí nhớ của bạn'), hit('X', 'Xe điện: những thay đổi trong năm nay', 'example.com · 6 ngày trước'), el('p', 'd-note', 'Tìm thấy ngay trên máy. Không có gì được tải lên.')); return c; } }
    ]
  };
  function field(k, v) { const d = el('div', 'd-field'); d.append(el('b', '', k), el('span', '', v)); return d; }
  function actions(btn, note) { const d = el('div', 'd-act'); d.append(el('span', 'd-btn', btn), el('span', 'd-note', note)); return d; }
  function hit(ico, title, meta) { const d = el('div', 'd-hit'); const b = el('div'); b.append(el('b', '', title), el('span', '', meta)); d.append(el('span', 'd-ico', ico), b); return d; }

  const qEl = $('#demo-q');
  const chipEl = $('#demo-chip');
  const body = $('#demo-body');
  let run = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function showCard(i) {
    body.replaceChildren();
    const row = el('div', 'd-row');
    row.append(DEMO[lang][i].card());
    body.append(row);
  }

  async function play() {
    const id = ++run;
    if (calm) { qEl.textContent = DEMO[lang][0].q; chipEl.hidden = false; chipEl.textContent = DEMO[lang][0].chip + '  ↵'; showCard(0); return; }
    for (let i = 0; ; i = (i + 1) % 3) {
      const text = DEMO[lang][i].q;
      body.replaceChildren();
      qEl.textContent = '';
      chipEl.hidden = true;
      await sleep(500);
      for (let k = 1; k <= text.length; k++) {
        if (id !== run) return;
        qEl.textContent = text.slice(0, k);
        if (k === 2) { chipEl.textContent = DEMO[lang][i].chip + '  ↵'; chipEl.hidden = false; }
        await sleep(36 + Math.random() * 40);
      }
      await sleep(450);
      if (id !== run) return;
      showCard(i);
      await sleep(5200);
      while (document.hidden) await sleep(500);
      if (id !== run) return;
    }
  }

  // ---- Language -----------------------------------------------------------------------------------------------
  function setLang(l, remember) {
    lang = l;
    document.documentElement.lang = l;
    for (const n of nodes) { const k = n.dataset.i18n; const v = t(k); if (v !== undefined) n.innerHTML = v; }
    for (const b of $$('.lang button')) b.setAttribute('aria-pressed', String(b.dataset.lang === l));
    document.title = l === 'vi' ? 'Lore: trình duyệt AI riêng tư' : 'Lore: the private AI browser';
    if (remember) { try { localStorage.setItem('lore-lang', l); } catch { /* optional */ } }
    paintCta();
    play();
  }
  let saved = '';
  try { saved = localStorage.getItem('lore-lang') || ''; } catch { /* optional */ }
  const initial = saved || (/^vi\b/i.test(navigator.language || '') ? 'vi' : 'en');
  for (const b of $$('.lang button')) b.addEventListener('click', () => setLang(b.dataset.lang, true));

  // ---- Night: pick where the AI runs --------------------------------------------------------------------------
  const choiceText = $('#choice-text');
  for (const b of $$('.choices button')) {
    b.addEventListener('click', () => {
      for (const o of $$('.choices button')) o.setAttribute('aria-selected', String(o === b));
      choiceText.dataset.i18n = 'c.t' + b.dataset.choice;
      choiceText.innerHTML = t(choiceText.dataset.i18n);
    });
  }

  // ---- Reveal on scroll, and the story that follows the day --------------------------------------------------
  if ('IntersectionObserver' in window && !calm) {
    for (const group of $$('.cards, .dl, .bento, .steps3')) [...group.children].forEach((c, i) => c.style.setProperty('--i', i));
    const seen = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); } }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    for (const r of $$('.reveal')) seen.observe(r);
  } else {
    for (const r of $$('.reveal')) r.classList.add('in');
  }

  // ---- Downloads ----------------------------------------------------------------------------------------------
  const ua = navigator.userAgent || '';
  const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const os = /win/i.test(plat) || /Windows/.test(ua) ? 'windows' : /mac/i.test(plat) || /Mac OS X/.test(ua) ? 'mac' : /linux/i.test(plat) && !/Android/.test(ua) ? 'linux' : 'other';
  const base = gh + '/releases/latest/download/';
  let released = null; // null = not checked yet, false = no release, true = published
  const assets = new Set();
  const LABEL = {
    en: { windows: 'Download for Windows', mac: 'Download for macOS', linux: 'Download for Linux', other: 'Build Lore from source' },
    vi: { windows: 'Tải cho Windows', mac: 'Tải cho macOS', linux: 'Tải cho Linux', other: 'Tự build Lore' }
  };
  function paintCta() {
    const cta = $('#cta-main');
    $('#cta-label').textContent = LABEL[lang][os];
    const file = os === 'windows' ? 'Lore-win-x64-setup.exe' : os === 'mac' ? 'Lore-mac-arm64.dmg' : os === 'linux' ? 'Lore-linux-x64.AppImage' : '';
    cta.href = os === 'other' ? '#source' : released && (!assets.size || assets.has(file)) ? base + file : '#download';
  }
  for (const a of $$('[data-asset]')) a.href = base + a.dataset.asset;

  setLang(initial, false);

  fetch('https://api.github.com/repos/' + repo + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((rel) => {
      released = true;
      for (const a of rel.assets || []) assets.add(a.name);
      $('#ver').textContent = '· ' + rel.tag_name;
      for (const a of $$('[data-asset]')) {
        const found = (rel.assets || []).find((x) => x.name === a.dataset.asset);
        if (found) a.href = found.browser_download_url; else a.setAttribute('aria-disabled', 'true');
      }
      paintCta();
    })
    .catch(() => {
      // No release yet (or GitHub unreachable): keep the buttons honest instead of linking to a missing file.
      released = false;
      $('#no-release').hidden = false;
      for (const a of $$('[data-asset]')) { a.setAttribute('aria-disabled', 'true'); a.href = '#source'; }
      paintCta();
    });
})();
