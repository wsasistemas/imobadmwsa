import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import { Building2 } from "lucide-react";
import { useSignedUrls } from "@/hooks/useSignedUrls";

export function Gallery({ paths }: { paths: string[] }) {
  const { data: urls } = useSignedUrls(paths);

  if (!paths.length) {
    return (
      <div className="flex aspect-[16/9] items-center justify-center rounded-lg bg-muted">
        <Building2 className="h-16 w-16 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <Swiper
      modules={[Navigation, Pagination]}
      navigation
      pagination={{ clickable: true }}
      loop={paths.length > 1}
      className="overflow-hidden rounded-lg"
    >
      {paths.map((p) => (
        <SwiperSlide key={p}>
          <div className="aspect-[16/9] bg-muted">
            {urls?.get(p) && (
              <img src={urls.get(p)} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
