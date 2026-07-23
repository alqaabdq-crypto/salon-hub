import { Link } from "@/i18n/navigation";

type Props = {
  /** Href is locale-relative; the Link component adds the prefix. */
  links: { href: string; label: string }[];
};

export function DashboardNav({ links }: Props) {
  return (
    <nav className="-mx-1 flex flex-wrap gap-1 border-b border-gray-200 pb-3 dark:border-gray-800">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-900"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
