// Ready-made posts that introduce one feature of Lore each. They are plain text written by hand, so what gets posted is exactly
// what was shown and approved: no model improvises at posting time.
const LINK = 'https://tevo-web.github.io/lore/';

const VI = [
  'Lore: trình duyệt nhớ bạn, và chỉ mình bạn.\nMiễn phí, mã nguồn mở, không cần tài khoản, không gửi dữ liệu về đâu. Lịch sử và "trí nhớ" của bạn nằm mã hóa ngay trên máy.',
  'Quá nhiều tab? Trong Lore, tab nằm thành danh sách bên trái, và AI đọc tiêu đề rồi gom chúng theo chủ đề: một chuyến đi, một dự án, một mối quan tâm. Bạn xem kế hoạch trước, bấm Áp dụng, và hoàn tác được nếu đổi ý.',
  'Mỗi trang web đều có một ô hỏi ngay bên cạnh: hỏi, hoặc nhờ Lore làm gì đó. Hỏi "bài này có nói đến giá không?" thì Lore chỉ đúng dòng trong trang. Mở thêm một tab, cứ hỏi tiếp: câu trả lời ghi rõ ý nào lấy từ trang nào.',
  'Nhớ nội dung nhưng quên địa chỉ trang? Cứ hỏi Lore theo ý, ví dụ "bài báo tuần trước về xe điện". Lore tìm lại trong bộ nhớ mã hóa chỉ nằm trên máy bạn, và có thể tóm tắt giúp hôm nay bạn đã đọc những gì.',
  'Lore chặn quảng cáo và trình theo dõi, chặn cookie bên thứ ba, gỡ các mã theo dõi (utm, fbclid) khỏi liên kết, ưu tiên kết nối https và dùng DNS mã hóa. Bấm vào biểu tượng khiên để xem và bật tắt từng thứ, kể cả theo từng trang web.',
  'Đang so sánh hai ba sản phẩm ở nhiều tab? Lore đọc các trang và lập một bảng so sánh; con số nào không có trên trang gốc sẽ bị đánh dấu để bạn kiểm tra. PDF mở ngay trong tab và Lore trả lời kèm số trang.',
  'AI do bạn chọn: mô hình chạy ngay trên máy qua Ollama (điều bạn hỏi không rời máy), khóa API riêng của bạn (OpenAI, Claude, Gemini, Mistral), hoặc tắt hẳn. Có chế độ tiết kiệm token, và Lore luôn cho biết văn bản đã được gửi đi đâu.',
  'Mật khẩu của bạn ở lại trên máy: lưu trong chìa khóa của hệ điều hành, chỉ điền khi bạn yêu cầu và chỉ trên đúng trang. Lore còn kiểm tra mật khẩu có bị lộ không mà không gửi mật khẩu đi, và tạo được email ẩn danh khi đăng ký.'
];

const EN = [
  'Lore: the browser that remembers you. Only you.\nFree, open source, no account, nothing phones home. Your history and "memory" stay encrypted on your computer.',
  'Too many tabs? In Lore they live in a list on the left, and AI reads their titles and groups them by what they are about. You see the plan first, press Apply, and can undo it.',
  'Every page has a box right beside it: ask, or tell Lore what to do. Ask "does this mention a price?" and it points to the exact line. Open another tab and keep asking: each answer says which page each claim came from.',
  'Remember the idea but not the address? Ask Lore in plain words, like "the article I read last week about electric cars". It searches an encrypted memory that lives only on your computer.',
  'Lore blocks ads and trackers and third-party cookies, strips tracking tags (utm, fbclid) from links, tries https first and uses encrypted DNS. Click the shield to see and switch each one, even per site.',
  'Comparing a few products across tabs? Lore reads the pages and builds one table; any figure that is not on the page is flagged. PDFs open in the tab and answers cite the page number.',
  'Your AI, your rules: a model on your own computer through Ollama, your own API key (OpenAI, Claude, Gemini, Mistral), or no AI at all. A token saver mode, and Lore always tells you where text went.',
  'Your passwords stay on your computer: kept in the system keychain, filled only when you ask and only on the right site. Lore checks for breaches without sending the password, and makes email aliases for sign-ups.'
];

// n posts in the language asked for, each with the link and a tag.
function featurePosts(lang = 'vi', n = 8) {
  const base = lang === 'en' ? EN : VI;
  return base.slice(0, n).map((t) => `${t}\n\n${LINK} #Lore`);
}

module.exports = { featurePosts, LINK };
