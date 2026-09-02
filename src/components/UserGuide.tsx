import React from 'react';
import {
  BookOpen,
  FilePlus,
  Search,
  QrCode,
  Lock,
  Users,
  Archive,
  Settings as SettingsIcon,
  ShieldCheck
} from 'lucide-react';

interface Section {
  icon: any;
  title: string;
  items: string[];
}

const SECTIONS: Section[] = [
  {
    icon: FilePlus,
    title: 'Thêm văn bản',
    items: [
      'Chọn "Thêm văn bản đi" hoặc "Thêm văn bản đến" trên thanh menu bên trái.',
      'Chọn loại văn bản — mỗi loại có nhãn "Chung công ty" (dùng chung toàn công ty) hoặc "Phòng ban" (chỉ phòng ban của bạn quản lý).',
      'Mã số hệ thống được tự động cấp theo quy tắc đã cấu hình cho loại văn bản đó. Với văn bản đến, bạn có thể tự nhập mã số riêng.',
      'Điền tiêu đề, ngày ban hành/ngày nhận, nơi gửi (nếu là văn bản đến), sau đó chọn vị trí lưu trữ vật lý (Kho > Tủ > Ngăn/Hộc) và đính kèm file scan nếu có.',
      'Điền các trường theo chuẩn ISO 15489 & 9001: độ mật, thời hạn bảo quản, phiên bản, trạng thái hiệu lực — giúp tài liệu được phân loại và tra cứu đúng chuẩn.'
    ]
  },
  {
    icon: Search,
    title: 'Tra cứu văn bản',
    items: [
      'Dùng ô tìm kiếm ở đầu trang để tìm theo mã số, tiêu đề hoặc nội dung trích xuất (OCR).',
      'Vào "Tất cả văn bản", "Văn bản đi" hoặc "Văn bản đến" để lọc theo loại.',
      'Bạn chỉ nhìn thấy văn bản của phòng ban mình và các văn bản chung công ty do chính bạn lấy số — đây là quy tắc bảo mật của hệ thống, không phải lỗi hiển thị.'
    ]
  },
  {
    icon: Lock,
    title: 'Chỉnh sửa & khóa văn bản',
    items: [
      'Với văn bản thuộc kho dùng chung công ty do bạn tạo, bạn chỉ được chỉnh sửa tự do trong một khoảng thời gian nhất định sau khi tạo (mặc định 4 giờ, do quản trị viên cấu hình) hoặc cho đến khi văn bản có bản scan đính kèm.',
      'Sau khi hết thời gian đó, văn bản sẽ hiển thị biểu tượng khóa. Bấm "Yêu cầu chỉnh sửa", nhập lý do và gửi — quản trị viên sẽ xem xét và phê duyệt.',
      'Văn bản thuộc phòng ban (không phải chung công ty) không bị giới hạn thời gian — nhân viên trong phòng ban đó có thể chỉnh sửa bất cứ lúc nào.'
    ]
  },
  {
    icon: QrCode,
    title: 'Mã QR & vị trí lưu trữ vật lý',
    items: [
      'Vào "Quản lý Mã QR" để in mã QR cho từng vị trí lưu trữ (Kho, Tủ, Ngăn/Hộc) hoặc từng thư mục.',
      'Quét mã QR dán trên kệ/tủ để xem ngay danh sách các vị trí con, thư mục và tài liệu đang lưu tại đó — kể cả khi chưa đăng nhập (với văn bản độ mật Thường).'
    ]
  },
  {
    icon: Archive,
    title: 'Hết hạn lưu trữ & hủy bản cứng',
    items: [
      'Mỗi văn bản có "Thời hạn bảo quản" theo ISO 15489 (5/10/20 năm hoặc vĩnh viễn), tính từ ngày ban hành.',
      'Khi văn bản sắp hoặc đã hết thời hạn bảo quản, hệ thống hiển thị cảnh báo trên Bảng điều khiển và trên danh sách văn bản.',
      'Khi bản cứng (giấy) đã thực sự bị hủy sau khi hết hạn, quản trị viên hoặc nhân viên phụ trách phòng ban đó bấm nút hủy bản cứng trên danh sách văn bản — hệ thống sẽ đánh dấu "Đã hủy bản cứng" (dữ liệu điện tử vẫn được lưu để tra cứu, chỉ bản giấy bị loại bỏ).'
    ]
  },
  {
    icon: ShieldCheck,
    title: 'Phân quyền theo phòng ban',
    items: [
      'Admin: toàn quyền trên mọi phòng ban, quản lý nhân sự, tài khoản, cấu hình hệ thống và các tài liệu dùng chung công ty.',
      'Nhân viên: gần như đầy đủ quyền của Admin nhưng chỉ trong phạm vi phòng ban mình — được xem, thêm, sửa, xóa tài liệu, tự cấu hình loại văn bản và vị trí lưu trữ vật lý của phòng ban.',
      'Với tài liệu chung công ty (không thuộc phòng ban nào), nhân viên chỉ được thao tác trên tài liệu do chính mình lấy số, trong khung giờ chỉnh sửa cho phép.'
    ]
  },
  {
    icon: SettingsIcon,
    title: 'Cấu hình hệ thống',
    items: [
      'Nhân viên có thể tự cấu hình quy tắc mã số và vị trí lưu trữ vật lý cho phòng ban mình trong mục "Cấu hình".',
      'Admin quản lý thêm: danh sách phòng ban, tài khoản người dùng, phê duyệt yêu cầu chỉnh sửa, thương hiệu (logo, tên ứng dụng) và các loại văn bản dùng chung công ty.'
    ]
  }
];

export default function UserGuide() {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Hướng dẫn sử dụng</h2>
          <p className="text-xs text-slate-400 font-medium tracking-wide">Các thao tác cơ bản trên hệ thống quản lý văn thư</p>
        </div>
      </div>

      <div className="p-8 space-y-8 overflow-y-auto">
        {SECTIONS.map((section) => (
          <div key={section.title} className="space-y-3">
            <div className="flex items-center gap-2 text-blue-600">
              <section.icon className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">{section.title}</h3>
            </div>
            <ul className="space-y-2">
              {section.items.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-600 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-200 shrink-0 mt-2" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
