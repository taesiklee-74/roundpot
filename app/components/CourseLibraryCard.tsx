// app/components/CourseLibraryCard.tsx

"use client";

import { useMemo, useState } from "react";
import type { SavedCourse } from "../utils/courseLibrary";

type CourseLibraryCardProps = {
  savedCourses: SavedCourse[];
  onLoadCourse: (course: SavedCourse) => void;
  onDeleteCourse: (courseId: string) => void;
};

export default function CourseLibraryCard({
  savedCourses,
  onLoadCourse,
  onDeleteCourse,
}: CourseLibraryCardProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  const selectedCourse = useMemo(
    () => savedCourses.find((course) => course.id === selectedCourseId) ?? null,
    [savedCourses, selectedCourseId]
  );

  function deleteSelectedCourse() {
    if (!selectedCourse) return;

    onDeleteCourse(selectedCourse.id);
    setSelectedCourseId("");
  }

  function loadSelectedCourse() {
    if (!selectedCourse) return;

    onLoadCourse(selectedCourse);
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-bold">저장된 골프장</h2>
        <p className="mt-1 text-sm text-neutral-500">
          이전에 입력한 Par와 홀 핸디캡 정보를 불러옵니다.
        </p>
        <p className="mt-1 text-sm font-semibold text-blue-700">
          찾으시는 골프장 정보가 없으면 아래에 직접 입력하세요.
        </p>
      </div>

      {savedCourses.length === 0 ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          아직 저장된 골프장이 없습니다. 아래 라운드 정보에서 직접 입력하면 라운드 시작 시 자동 저장됩니다.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-2">
            {savedCourses.map((course) => {
              const isSelected = course.id === selectedCourseId;

              return (
                <button
                  key={course.id}
                  type="button"
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-bold ${
                    isSelected
                      ? "border-blue-600 bg-blue-50 text-blue-800"
                      : "border-neutral-200 bg-white text-neutral-900"
                  }`}
                  onClick={() => setSelectedCourseId(course.id)}
                >
                  {course.name}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded-xl bg-blue-600 px-3 py-3 text-sm font-bold text-white disabled:bg-neutral-300"
              disabled={!selectedCourse}
              onClick={loadSelectedCourse}
            >
              선택한 골프장 불러오기
            </button>
            <button
              type="button"
              className="rounded-xl bg-red-50 px-3 py-3 text-sm font-bold text-red-700 disabled:bg-neutral-100 disabled:text-neutral-400"
              disabled={!selectedCourse}
              onClick={deleteSelectedCourse}
            >
              선택한 골프장 삭제
            </button>
          </div>
        </>
      )}
    </section>
  );
}
